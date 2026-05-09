import Database from "./adapter";
import { v4 as uuidv4 } from "uuid";
import type {
  CreateShareEntryDTO,
  PublicShareResponse,
  ShareEntry,
  ShareSearchQuery,
  ShareSourceSnapshot,
  UpdateShareEntryDTO,
} from "@prompthub/shared/types";

interface ShareEntryRow {
  id: string;
  owner_user_id: string | null;
  visibility: string;
  share_id: string;
  title: string;
  description: string | null;
  content: string;
  prompt_content: string | null;
  tags: string | null;
  folder_id: string | null;
  source: string | null;
  notes: string | null;
  is_favorite: number;
  is_sharing_enabled: number;
  source_snapshot: string | null;
  created_at: number;
  updated_at: number;
}

function createShareId(): string {
  return uuidv4().replace(/-/g, "");
}

function parseJsonArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseSourceSnapshot(value: string | null): ShareSourceSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as ShareSourceSnapshot;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toMillis(value: string | undefined): number {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export class ShareDB {
  constructor(private db: Database.Database) {}

  create(data: CreateShareEntryDTO): ShareEntry {
    const id = uuidv4();
    const now = Date.now();

    this.db
      .prepare(
        `INSERT INTO share_entries (
          id, share_id, title, description, content, prompt_content, tags, folder_id, source, notes,
          is_favorite, is_sharing_enabled, source_snapshot, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        createShareId(),
        data.title,
        data.description ?? null,
        data.content,
        data.promptContent ?? null,
        JSON.stringify(data.tags ?? []),
        data.folderId ?? null,
        data.source ?? null,
        data.notes ?? null,
        0,
        data.isSharingEnabled ? 1 : 0,
        data.sourceSnapshot ? JSON.stringify(data.sourceSnapshot) : null,
        now,
        now,
      );

    return this.getById(id)!;
  }

  getById(id: string): ShareEntry | null {
    const row = this.db
      .prepare("SELECT * FROM share_entries WHERE id = ?")
      .get(id) as ShareEntryRow | undefined;
    return row ? this.rowToShare(row) : null;
  }

  getByShareId(shareId: string): ShareEntry | null {
    const row = this.db
      .prepare("SELECT * FROM share_entries WHERE share_id = ?")
      .get(shareId) as ShareEntryRow | undefined;
    return row ? this.rowToShare(row) : null;
  }

  getAll(): ShareEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM share_entries ORDER BY updated_at DESC")
      .all() as ShareEntryRow[];
    return rows.map((row) => this.rowToShare(row));
  }

  update(id: string, data: UpdateShareEntryDTO): ShareEntry | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = Date.now();
    const updates: string[] = ["updated_at = ?"];
    const values: Array<string | number | null> = [now];

    if (data.title !== undefined) {
      updates.push("title = ?");
      values.push(data.title);
    }
    if (data.description !== undefined) {
      updates.push("description = ?");
      values.push(data.description);
    }
    if (data.content !== undefined) {
      updates.push("content = ?");
      values.push(data.content);
    }
    if (data.promptContent !== undefined) {
      updates.push("prompt_content = ?");
      values.push(data.promptContent);
    }
    if (data.tags !== undefined) {
      updates.push("tags = ?");
      values.push(JSON.stringify(data.tags));
    }
    if (data.folderId !== undefined) {
      updates.push("folder_id = ?");
      values.push(data.folderId);
    }
    if (data.source !== undefined) {
      updates.push("source = ?");
      values.push(data.source);
    }
    if (data.notes !== undefined) {
      updates.push("notes = ?");
      values.push(data.notes);
    }
    if (data.isFavorite !== undefined) {
      updates.push("is_favorite = ?");
      values.push(data.isFavorite ? 1 : 0);
    }
    if (data.isSharingEnabled !== undefined) {
      updates.push("is_sharing_enabled = ?");
      values.push(data.isSharingEnabled ? 1 : 0);
    }
    if (data.sourceSnapshot !== undefined) {
      updates.push("source_snapshot = ?");
      values.push(data.sourceSnapshot ? JSON.stringify(data.sourceSnapshot) : null);
    }

    values.push(id);

    this.db
      .prepare(`UPDATE share_entries SET ${updates.join(", ")} WHERE id = ?`)
      .run(...values);

    return {
      ...existing,
      updatedAt: new Date(now).toISOString(),
      ...(data.title !== undefined && { title: data.title }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.content !== undefined && { content: data.content }),
      ...(data.promptContent !== undefined && { promptContent: data.promptContent }),
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.folderId !== undefined && { folderId: data.folderId }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.isFavorite !== undefined && { isFavorite: data.isFavorite }),
      ...(data.isSharingEnabled !== undefined && { isSharingEnabled: data.isSharingEnabled }),
      ...(data.sourceSnapshot !== undefined && { sourceSnapshot: data.sourceSnapshot }),
    };
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM share_entries WHERE id = ?").run(id);
    return result.changes > 0;
  }

  insertShareDirect(share: ShareEntry): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO share_entries (
          id, owner_user_id, visibility, share_id, title, description, content, prompt_content, tags,
          folder_id, source, notes, is_favorite, is_sharing_enabled, source_snapshot,
          created_at, updated_at
        ) VALUES (
          @id, @owner_user_id, @visibility, @share_id, @title, @description, @content, @prompt_content, @tags,
          @folder_id, @source, @notes, @is_favorite, @is_sharing_enabled, @source_snapshot,
          @created_at, @updated_at
        )`,
      )
      .run({
        "@id": share.id,
        "@owner_user_id": share.ownerUserId ?? null,
        "@visibility": share.visibility ?? "private",
        "@share_id": share.shareId || createShareId(),
        "@title": share.title,
        "@description": share.description ?? null,
        "@content": share.content,
        "@prompt_content": share.promptContent ?? null,
        "@tags": JSON.stringify(share.tags ?? []),
        "@folder_id": share.folderId ?? null,
        "@source": share.source ?? null,
        "@notes": share.notes ?? null,
        "@is_favorite": share.isFavorite ? 1 : 0,
        "@is_sharing_enabled": share.isSharingEnabled ? 1 : 0,
        "@source_snapshot": share.sourceSnapshot ? JSON.stringify(share.sourceSnapshot) : null,
        "@created_at": toMillis(share.createdAt),
        "@updated_at": toMillis(share.updatedAt),
      });
  }

  search(query: ShareSearchQuery): ShareEntry[] {
    let items = this.getAll();

    if (query.keyword) {
      const needle = query.keyword.toLowerCase();
      items = items.filter((item) =>
        [
          item.title,
          item.description ?? "",
          item.content,
          item.promptContent ?? "",
          item.source ?? "",
          item.notes ?? "",
          item.sourceSnapshot?.systemPrompt ?? "",
          item.sourceSnapshot?.userPrompt ?? "",
          item.sourceSnapshot?.messageContent ?? "",
          ...item.tags,
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }

    if (query.folderId) {
      items = items.filter((item) => item.folderId === query.folderId);
    }
    if (query.isFavorite !== undefined) {
      items = items.filter((item) => item.isFavorite === query.isFavorite);
    }
    if (query.tags?.length) {
      items = items.filter((item) =>
        query.tags!.every((tag) => item.tags.includes(tag)),
      );
    }

    const direction = query.sortOrder === "asc" ? 1 : -1;
    const sortBy = query.sortBy ?? "updatedAt";
    items.sort((a, b) => {
      if (sortBy === "title") {
        return a.title.localeCompare(b.title) * direction;
      }
      const aTime = new Date(sortBy === "createdAt" ? a.createdAt : a.updatedAt).getTime();
      const bTime = new Date(sortBy === "createdAt" ? b.createdAt : b.updatedAt).getTime();
      return (aTime - bTime) * direction;
    });

    const offset = query.offset ?? 0;
    const limit = query.limit ?? items.length;
    return items.slice(offset, offset + limit);
  }

  toPublic(shareId: string): PublicShareResponse {
    const share = this.getByShareId(shareId);
    if (!share || !share.isSharingEnabled) {
      return { available: false };
    }

    return {
      available: true,
      shareId: share.shareId,
      title: share.title,
      description: share.description,
      content: share.content,
      promptContent: share.promptContent,
      sourceSnapshot: share.sourceSnapshot,
      updatedAt: share.updatedAt,
    };
  }

  private rowToShare(row: ShareEntryRow): ShareEntry {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id ?? undefined,
      visibility: (row.visibility as ShareEntry["visibility"]) ?? "private",
      shareId: row.share_id,
      title: row.title,
      description: row.description,
      content: row.content,
      promptContent: row.prompt_content,
      tags: parseJsonArray(row.tags),
      folderId: row.folder_id,
      source: row.source,
      notes: row.notes,
      isFavorite: row.is_favorite === 1,
      isSharingEnabled: row.is_sharing_enabled === 1,
      sourceSnapshot: parseSourceSnapshot(row.source_snapshot),
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
}
