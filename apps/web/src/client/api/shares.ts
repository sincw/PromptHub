import type {
  CreateShareEntryDTO,
  PublicShareResponse,
  ShareEntry,
  ShareSearchQuery,
  UpdateShareEntryDTO,
} from '@prompthub/shared';
import { fetchWithAuthRetry } from './auth-session';

interface ApiEnvelope<T> {
  data: T;
}

interface ApiErrorPayload {
  error?: {
    message?: string;
  };
}

async function extractErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiErrorPayload;
    return payload.error?.message ?? fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

function getHeaders(token: string, includeJson = false): HeadersInit {
  return {
    ...(includeJson ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token}`,
  };
}

async function requestJson<T>(url: string, options: RequestInit, fallbackMessage: string): Promise<ApiEnvelope<T>> {
  const response = await fetchWithAuthRetry(url, options);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return (await response.json()) as ApiEnvelope<T>;
}

function buildQueryString(query: ShareSearchQuery): string {
  const params = new URLSearchParams();
  if (query.scope) params.set('scope', query.scope);
  if (query.keyword) params.set('keyword', query.keyword);
  if (query.tags?.length) params.set('tags', query.tags.join(','));
  if (query.folderId) params.set('folderId', query.folderId);
  if (query.isFavorite !== undefined) params.set('isFavorite', String(query.isFavorite));
  if (query.sortBy) params.set('sortBy', query.sortBy);
  if (query.sortOrder) params.set('sortOrder', query.sortOrder);
  if (query.limit !== undefined) params.set('limit', String(query.limit));
  if (query.offset !== undefined) params.set('offset', String(query.offset));
  const result = params.toString();
  return result ? `?${result}` : '';
}

export async function getShares(token: string, query: ShareSearchQuery = {}): Promise<ApiEnvelope<ShareEntry[]>> {
  return requestJson<ShareEntry[]>(
    `/api/shares${buildQueryString(query)}`,
    { headers: getHeaders(token) },
    'Request failed',
  );
}

export async function createShare(token: string, data: CreateShareEntryDTO): Promise<ApiEnvelope<ShareEntry>> {
  return requestJson<ShareEntry>(
    '/api/shares',
    {
      method: 'POST',
      headers: getHeaders(token, true),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function updateShare(token: string, id: string, data: UpdateShareEntryDTO): Promise<ApiEnvelope<ShareEntry>> {
  return requestJson<ShareEntry>(
    `/api/shares/${id}`,
    {
      method: 'PUT',
      headers: getHeaders(token, true),
      body: JSON.stringify(data),
    },
    'Request failed',
  );
}

export async function deleteShare(token: string, id: string): Promise<ApiEnvelope<{ ok: true }>> {
  return requestJson<{ ok: true }>(
    `/api/shares/${id}`,
    {
      method: 'DELETE',
      headers: getHeaders(token),
    },
    'Request failed',
  );
}

export async function getPublicShare(shareId: string): Promise<ApiEnvelope<PublicShareResponse>> {
  const response = await fetch(`/api/public/shares/${encodeURIComponent(shareId)}`);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Request failed'));
  }
  return (await response.json()) as ApiEnvelope<PublicShareResponse>;
}
