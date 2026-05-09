import { ShareDB } from '@prompthub/db';
import type {
  CreateShareEntryDTO,
  PublicShareResponse,
  ShareEntry,
  ShareSearchQuery,
  UpdateShareEntryDTO,
} from '@prompthub/shared';
import { getServerDatabase } from '../database.js';
import { ErrorCode } from '../utils/response.js';

export interface ShareActor {
  userId: string;
  role: 'admin' | 'user';
}

interface ShareRow {
  id: string;
  owner_user_id: string | null;
  visibility: 'private' | 'shared';
}

export class ShareServiceError extends Error {
  constructor(
    public readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ShareServiceError';
  }
}

export class ShareService {
  private readonly shareDb = new ShareDB(getServerDatabase());
  private readonly db = getServerDatabase();

  create(actor: ShareActor, data: CreateShareEntryDTO): ShareEntry {
    const visibility = data.visibility ?? 'private';
    this.assertCanCreate(actor, visibility);

    const share = this.shareDb.create(data);
    this.db
      .prepare('UPDATE share_entries SET owner_user_id = ?, visibility = ? WHERE id = ?')
      .run(actor.userId, visibility, share.id);

    return this.getById(actor, share.id);
  }

  list(actor: ShareActor, query: ShareSearchQuery): ShareEntry[] {
    const rows = this.getVisibleRows(actor, query.scope ?? 'private');
    const allowedIds = new Set(rows.map((row) => row.id));
    return this.shareDb.search(query).filter((share) => allowedIds.has(share.id));
  }

  getById(actor: ShareActor, id: string): ShareEntry {
    const row = this.getRow(id);
    if (!row) {
      throw new ShareServiceError(404, ErrorCode.NOT_FOUND, 'Share not found');
    }

    this.assertCanRead(actor, row);

    const share = this.shareDb.getById(id);
    if (!share) {
      throw new ShareServiceError(404, ErrorCode.NOT_FOUND, 'Share not found');
    }

    return {
      ...share,
      ownerUserId: row.owner_user_id,
      visibility: row.visibility,
    };
  }

  update(actor: ShareActor, id: string, data: UpdateShareEntryDTO): ShareEntry {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const nextVisibility = data.visibility ?? row.visibility;
    if (nextVisibility !== row.visibility && actor.role !== 'admin') {
      throw new ShareServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can change shared visibility');
    }

    const share = this.shareDb.update(id, data);
    if (!share) {
      throw new ShareServiceError(404, ErrorCode.NOT_FOUND, 'Share not found');
    }

    if (data.visibility !== undefined) {
      this.db.prepare('UPDATE share_entries SET visibility = ? WHERE id = ?').run(data.visibility, id);
    }

    return this.getById(actor, id);
  }

  delete(actor: ShareActor, id: string): void {
    const row = this.getRequiredRow(id);
    this.assertCanWrite(actor, row);

    const deleted = this.shareDb.delete(id);
    if (!deleted) {
      throw new ShareServiceError(404, ErrorCode.NOT_FOUND, 'Share not found');
    }
  }

  getPublic(shareId: string): PublicShareResponse {
    return this.shareDb.toPublic(shareId);
  }

  private getVisibleRows(actor: ShareActor, scope: 'private' | 'shared' | 'all'): ShareRow[] {
    if (scope === 'private') {
      return this.db
        .prepare('SELECT id, owner_user_id, visibility FROM share_entries WHERE owner_user_id = ? AND visibility = ? ORDER BY updated_at DESC')
        .all(actor.userId, 'private') as ShareRow[];
    }

    if (scope === 'shared') {
      return this.db
        .prepare("SELECT id, owner_user_id, visibility FROM share_entries WHERE visibility = 'shared' ORDER BY updated_at DESC")
        .all() as ShareRow[];
    }

    return this.db
      .prepare('SELECT id, owner_user_id, visibility FROM share_entries WHERE (owner_user_id = ? AND visibility = ?) OR visibility = ? ORDER BY updated_at DESC')
      .all(actor.userId, 'private', 'shared') as ShareRow[];
  }

  private getRow(id: string): ShareRow | null {
    const row = this.db
      .prepare('SELECT id, owner_user_id, visibility FROM share_entries WHERE id = ?')
      .get(id) as ShareRow | undefined;
    return row ?? null;
  }

  private getRequiredRow(id: string): ShareRow {
    const row = this.getRow(id);
    if (!row) {
      throw new ShareServiceError(404, ErrorCode.NOT_FOUND, 'Share not found');
    }
    return row;
  }

  private assertCanCreate(actor: ShareActor, visibility: 'private' | 'shared'): void {
    if (visibility === 'shared' && actor.role !== 'admin') {
      throw new ShareServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can create shared shares');
    }
  }

  private assertCanRead(actor: ShareActor, row: ShareRow): void {
    if (row.visibility === 'shared') {
      return;
    }
    if (row.owner_user_id !== actor.userId) {
      throw new ShareServiceError(404, ErrorCode.NOT_FOUND, 'Share not found');
    }
  }

  private assertCanWrite(actor: ShareActor, row: ShareRow): void {
    if (row.visibility === 'shared') {
      if (actor.role !== 'admin') {
        throw new ShareServiceError(403, ErrorCode.FORBIDDEN, 'Only admin can modify shared shares');
      }
      return;
    }

    if (row.owner_user_id !== actor.userId) {
      throw new ShareServiceError(404, ErrorCode.NOT_FOUND, 'Share not found');
    }
  }
}
