import * as dns from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import { Readable } from 'node:stream';
import * as tls from 'node:tls';
import ipaddr from 'ipaddr.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;

interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface RemoteRequestOptions {
  url: string;
  method: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
  allowedProtocols?: readonly string[];
  allowPrivateAddresses?: boolean;
  useEnvironmentProxy?: boolean;
}

export interface RemoteBufferedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: Buffer;
  finalUrl: string;
}

export interface RemoteStreamResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: ReadableStream<Uint8Array> | null;
  finalUrl: string;
}

export function isBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'localhost.localdomain' ||
    normalized.endsWith('.localdomain')
  );
}

function normalizeHostname(hostname: string): string {
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    return hostname.slice(1, -1);
  }
  return hostname;
}

const BLOCKED_IPV6_SUBNETS = [
  ipaddr.parseCIDR('::/128'),
  ipaddr.parseCIDR('::1/128'),
  ipaddr.parseCIDR('fc00::/7'),
  ipaddr.parseCIDR('fe80::/10'),
  ipaddr.parseCIDR('2001:db8::/32'),
  ipaddr.parseCIDR('2002::/16'),
  ipaddr.parseCIDR('64:ff9b::/96'),
  ipaddr.parseCIDR('100::/64'),
  ipaddr.parseCIDR('ff00::/8'),
] as const;

function isIPv6Address(address: ipaddr.IPv4 | ipaddr.IPv6): address is ipaddr.IPv6 {
  return address.kind() === 'ipv6';
}

export function isPrivateIPv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a >= 224 && a <= 239) ||
    a >= 240 ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0 && parts[2] === 2) ||
    (a === 198 && b === 51 && parts[2] === 100) ||
    (a === 203 && b === 0 && parts[2] === 113)
  );
}

export function isPrivateIPv6(address: string): boolean {
  let parsed: ipaddr.IPv4 | ipaddr.IPv6;

  try {
    parsed = ipaddr.parse(address);
  } catch {
    return false;
  }

  if (isIPv6Address(parsed)) {
    const ipv6 = parsed;

    if (ipv6.isIPv4MappedAddress()) {
      return isPrivateIPv4(ipv6.toIPv4Address().toString());
    }

    return BLOCKED_IPV6_SUBNETS.some(([range, prefix]) => ipv6.match(range, prefix));
  }

  return false;
}

export function isPrivateAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }

  const parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv4') {
    return isPrivateIPv4(address);
  }

  if (parsed.kind() === 'ipv6') {
    return isPrivateIPv6(address);
  }

  return false;
}

async function resolveAddress(hostname: string, allowPrivateAddresses = false): Promise<ResolvedAddress> {
  const normalizedHostname = normalizeHostname(hostname);

  if (!allowPrivateAddresses && isBlockedHostname(normalizedHostname)) {
    throw new Error('Access to local network addresses is not allowed');
  }

  if (ipaddr.isValid(normalizedHostname)) {
    if (!allowPrivateAddresses && isPrivateAddress(normalizedHostname)) {
      throw new Error('Access to internal network addresses is not allowed');
    }
    const parsed = ipaddr.parse(normalizedHostname);
    return { address: normalizedHostname, family: parsed.kind() === 'ipv6' ? 6 : 4 };
  }

  const addresses = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('Failed to resolve remote host');
  }

  if (!allowPrivateAddresses && addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Access to internal network addresses is not allowed');
  }

  const first = addresses[0];
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

function toHeadersObject(headers: http.IncomingHttpHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.join(', ');
    }
  }
  return result;
}

function getRequestModule(protocol: string): typeof http | typeof https {
  return protocol === 'https:' ? https : http;
}

function toRequestPath(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function getPort(url: URL): number {
  if (url.port) {
    return Number(url.port);
  }
  return url.protocol === 'https:' ? 443 : 80;
}

function getProxyEnv(protocol: string): string | undefined {
  if (protocol === 'https:') {
    return process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  }
  if (protocol === 'http:') {
    return process.env.HTTP_PROXY || process.env.http_proxy || process.env.ALL_PROXY || process.env.all_proxy;
  }
  return undefined;
}

function shouldBypassProxy(url: URL): boolean {
  const rawNoProxy = process.env.NO_PROXY || process.env.no_proxy || '';
  if (!rawNoProxy.trim()) {
    return false;
  }

  const hostname = normalizeHostname(url.hostname).toLowerCase();
  const hostWithPort = `${hostname}:${getPort(url)}`;

  return rawNoProxy
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .some((entry) => {
      if (entry === '*') return true;
      if (entry === hostname || entry === hostWithPort) return true;
      if (entry.includes('/') && ipaddr.isValid(hostname)) {
        try {
          const [range, prefix] = ipaddr.parseCIDR(entry);
          return ipaddr.parse(hostname).match(range, prefix);
        } catch {
          return false;
        }
      }
      if (entry.startsWith('.')) return hostname.endsWith(entry);
      return hostname === entry || hostname.endsWith(`.${entry}`);
    });
}

function getProxyUrlForRequest(url: URL, useEnvironmentProxy?: boolean): URL | null {
  if (!useEnvironmentProxy || shouldBypassProxy(url)) {
    return null;
  }

  const proxy = getProxyEnv(url.protocol);
  if (!proxy) {
    return null;
  }

  const proxyUrl = new URL(proxy);
  if (proxyUrl.protocol !== 'http:') {
    throw new Error(`Unsupported proxy protocol: ${proxyUrl.protocol}`);
  }

  return proxyUrl;
}

function normalizeHeaders(headers: Record<string, string> | undefined, host: string): Record<string, string> {
  const nextHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (value == null) {
      continue;
    }
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'host' || lowerKey === 'content-length') {
      continue;
    }
    nextHeaders[key] = value;
  }
  nextHeaders.Host = host;
  return nextHeaders;
}

function handleRedirect(
  response: http.IncomingMessage,
  parsedUrl: URL,
  options: RemoteRequestOptions,
  redirectCount: number,
  resolve: (value: { response: http.IncomingMessage; finalUrl: string }) => void,
  reject: (reason?: unknown) => void,
): boolean {
  const statusCode = response.statusCode ?? 0;
  const location = response.headers.location;

  if (statusCode >= 300 && statusCode < 400 && typeof location === 'string') {
    response.resume();
    const nextUrl = new URL(location, parsedUrl).toString();
    void openRemoteResponse({ ...options, url: nextUrl }, redirectCount + 1).then(resolve).catch(reject);
    return true;
  }

  return false;
}

function openHttpsViaHttpProxy(
  options: RemoteRequestOptions,
  parsedUrl: URL,
  proxyUrl: URL,
  redirectCount: number,
): Promise<{ response: http.IncomingMessage; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const targetHost = `${parsedUrl.hostname}:${getPort(parsedUrl)}`;
    const connectRequest = http.request({
      protocol: proxyUrl.protocol,
      hostname: proxyUrl.hostname,
      port: getPort(proxyUrl),
      method: 'CONNECT',
      path: targetHost,
      headers: { Host: targetHost },
      timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    connectRequest.once('connect', (connectResponse, socket) => {
      if ((connectResponse.statusCode ?? 0) < 200 || (connectResponse.statusCode ?? 0) >= 300) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed (${connectResponse.statusCode ?? 0})`));
        return;
      }

      const secureSocket = tls.connect({
        socket,
        servername: parsedUrl.hostname,
      });

      secureSocket.once('secureConnect', () => {
        const request = https.request(
          {
            protocol: parsedUrl.protocol,
            hostname: parsedUrl.hostname,
            port: getPort(parsedUrl),
            path: toRequestPath(parsedUrl),
            method: options.method,
            headers: normalizeHeaders(options.headers, parsedUrl.host),
            timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
            createConnection: () => secureSocket,
          },
          (response) => {
            if (handleRedirect(response, parsedUrl, options, redirectCount, resolve, reject)) {
              return;
            }
            resolve({ response, finalUrl: parsedUrl.toString() });
          },
        );

        request.on('timeout', () => {
          request.destroy(new Error('Remote request timed out'));
        });
        request.on('error', (requestError) => reject(requestError));

        if (options.body) {
          request.write(options.body);
        }
        request.end();
      });

      secureSocket.once('error', (socketError) => reject(socketError));
    });

    connectRequest.once('timeout', () => {
      connectRequest.destroy(new Error('Proxy CONNECT timed out'));
    });
    connectRequest.once('error', (proxyError) => reject(proxyError));
    connectRequest.end();
  });
}

async function openRemoteResponse(
  options: RemoteRequestOptions,
  redirectCount = 0,
): Promise<{ response: http.IncomingMessage; finalUrl: string }> {
  const allowedProtocols = options.allowedProtocols ?? ['https:', 'http:'];
  const parsedUrl = new URL(options.url);

  if (!allowedProtocols.includes(parsedUrl.protocol)) {
    throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
  }

  if (redirectCount > (options.maxRedirects ?? DEFAULT_MAX_REDIRECTS)) {
    throw new Error('Too many redirects');
  }

  const proxyUrl = getProxyUrlForRequest(parsedUrl, options.useEnvironmentProxy);
  if (proxyUrl && parsedUrl.protocol === 'https:') {
    return openHttpsViaHttpProxy(options, parsedUrl, proxyUrl, redirectCount);
  }

  const resolvedAddress = proxyUrl ? null : await resolveAddress(parsedUrl.hostname, options.allowPrivateAddresses);
  const requestModule = getRequestModule(parsedUrl.protocol);

  return new Promise((resolve, reject) => {
    const normalizedHeaders = normalizeHeaders(options.headers, parsedUrl.host);
    const requestOptions: http.RequestOptions | https.RequestOptions = proxyUrl
      ? {
          protocol: proxyUrl.protocol,
          hostname: proxyUrl.hostname,
          port: getPort(proxyUrl),
          path: parsedUrl.toString(),
          method: options.method,
          headers: normalizedHeaders,
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        }
      : {
          protocol: parsedUrl.protocol,
          hostname: resolvedAddress?.address,
          family: resolvedAddress?.family,
          servername: parsedUrl.hostname,
          port: getPort(parsedUrl),
          path: toRequestPath(parsedUrl),
          method: options.method,
          headers: normalizedHeaders,
          timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        };

    const request = requestModule.request(
      requestOptions,
      (response) => {
        if (handleRedirect(response, parsedUrl, options, redirectCount, resolve, reject)) {
          return;
        }

        resolve({ response, finalUrl: parsedUrl.toString() });
      },
    );

    request.on('timeout', () => {
      request.destroy(new Error('Remote request timed out'));
    });
    request.on('error', (requestError) => reject(requestError));

    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

export async function requestRemoteBuffered(options: RemoteRequestOptions): Promise<RemoteBufferedResponse> {
  const { response, finalUrl } = await openRemoteResponse(options);
  const chunks: Buffer[] = [];
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  let receivedBytes = 0;

  return await new Promise((resolve, reject) => {
    response.on('data', (chunk: Buffer) => {
      receivedBytes += chunk.length;
      if (receivedBytes > maxBytes) {
        response.destroy(new Error('Remote response exceeds size limit'));
        return;
      }
      chunks.push(chunk);
    });
    response.on('end', () => {
      resolve({
        status: response.statusCode ?? 0,
        statusText: response.statusMessage ?? '',
        headers: toHeadersObject(response.headers),
        body: Buffer.concat(chunks),
        finalUrl,
      });
    });
    response.on('error', (responseError) => reject(responseError));
  });
}

export async function requestRemoteStream(options: RemoteRequestOptions): Promise<RemoteStreamResponse> {
  const { response, finalUrl } = await openRemoteResponse(options);
  const body = Readable.toWeb(response) as ReadableStream<Uint8Array>;

  return {
    status: response.statusCode ?? 0,
    statusText: response.statusMessage ?? '',
    headers: toHeadersObject(response.headers),
    body,
    finalUrl,
  };
}
