import type { ResourceVisibility } from './prompt';

export type ShareMessageRole = 'system' | 'user' | 'assistant';

export interface ShareSourceSnapshot {
  promptId?: string | null;
  promptTitle?: string | null;
  systemPrompt?: string | null;
  userPrompt?: string | null;
  messageRole?: ShareMessageRole | null;
  messageContent?: string | null;
  messageCreatedAt?: string | null;
}

export interface ShareEntry {
  id: string;
  ownerUserId?: string | null;
  visibility?: ResourceVisibility;
  shareId: string;
  title: string;
  description?: string | null;
  content: string;
  promptContent?: string | null;
  tags: string[];
  folderId?: string | null;
  source?: string | null;
  notes?: string | null;
  isFavorite: boolean;
  isSharingEnabled: boolean;
  sourceSnapshot?: ShareSourceSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicShareEntry {
  available: true;
  shareId: string;
  title: string;
  description?: string | null;
  content: string;
  promptContent?: string | null;
  sourceSnapshot?: ShareSourceSnapshot | null;
  updatedAt: string;
}

export interface UnavailableShareEntry {
  available: false;
}

export type PublicShareResponse = PublicShareEntry | UnavailableShareEntry;

export interface CreateShareEntryDTO {
  visibility?: ResourceVisibility;
  title: string;
  description?: string;
  content: string;
  promptContent?: string | null;
  tags?: string[];
  folderId?: string | null;
  source?: string;
  notes?: string;
  isSharingEnabled?: boolean;
  sourceSnapshot?: ShareSourceSnapshot | null;
}

export interface UpdateShareEntryDTO {
  visibility?: ResourceVisibility;
  title?: string;
  description?: string;
  content?: string;
  promptContent?: string | null;
  tags?: string[];
  folderId?: string | null;
  source?: string;
  notes?: string;
  isFavorite?: boolean;
  isSharingEnabled?: boolean;
  sourceSnapshot?: ShareSourceSnapshot | null;
}

export interface ShareSearchQuery {
  scope?: 'private' | 'shared' | 'all';
  keyword?: string;
  tags?: string[];
  folderId?: string;
  isFavorite?: boolean;
  sortBy?: 'title' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}
