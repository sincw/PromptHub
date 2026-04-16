import * as dns from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import net from 'node:net';
import { Readable } from 'node:stream';

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

function isPrivateIPv4(address: string): boolean {
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

function isPrivateIPv6(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized === '::' || normalized === '::1') {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    return net.isIP(mapped) === 4 && isPrivateIPv4(mapped);
  }

  const halves = normalized.split('::');
  const segments =
    halves.length === 2
      ? [
          ...(halves[0] ? halves[0].split(':') : []),
          ...Array(8 - (halves[0] ? halves[0].split(':').length : 0) - (halves[1] ? halves[1].split(':').length : 0)).fill('0'),
          ...(halves[1] ? halves[1].split(':') : []),
        ]
      : normalized.split(':');

  if (segments.length < 2) {
    return false;
  }

  const first = Number.parseInt(segments[0], 16);
  const second = Number.parseInt(segments[1], 16) || 0;
  if (Number.isNaN(first)) {
    return false;
  }

  return (
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    first === 0x2002 ||
    (first === 0x2001 && second === 0x0000) ||
    (first === 0x2001 && second === 0x0db8) ||
    first === 0x0100 ||
    (first === 0x0064 && second === 0xff9b)
  );
}

function isPrivateAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) {
    return isPrivateIPv4(address);
  }
  if (family === 6) {
    return isPrivateIPv6(address);
  }
  return false;
}

async function resolvePublicAddress(hostname: string): Promise<ResolvedAddress> {
  const normalizedHostname = normalizeHostname(hostname);

  if (isBlockedHostname(normalizedHostname)) {
    throw new Error('Access to local network addresses is not allowed');
  }

  const ipFamily = net.isIP(normalizedHostname);
  if (ipFamily !== 0) {
    if (isPrivateAddress(normalizedHostname)) {
      throw new Error('Access to internal network addresses is not allowed');
    }
    return { address: normalizedHostname, family: ipFamily === 6 ? 6 : 4 };
  }

  const addresses = await dns.lookup(normalizedHostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error('Failed to resolve remote host');
  }

  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
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

  const resolvedAddress = await resolvePublicAddress(parsedUrl.hostname);
  const requestModule = getRequestModule(parsedUrl.protocol);

  return new Promise((resolve, reject) => {
    const request = requestModule.request(
      {
        protocol: parsedUrl.protocol,
        hostname: resolvedAddress.address,
        family: resolvedAddress.family,
        servername: parsedUrl.hostname,
        port: getPort(parsedUrl),
        path: toRequestPath(parsedUrl),
        method: options.method,
        headers: normalizeHeaders(options.headers, parsedUrl.host),
        timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const location = response.headers.location;

        if (statusCode >= 300 && statusCode < 400 && typeof location === 'string') {
          response.resume();
          const nextUrl = new URL(location, parsedUrl).toString();
          void openRemoteResponse({ ...options, url: nextUrl }, redirectCount + 1).then(resolve).catch(reject);
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
