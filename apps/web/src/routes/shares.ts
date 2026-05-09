import { Hono } from 'hono';
import { z } from 'zod';
import type { Context } from 'hono';
import { getAuthUser } from '../middleware/auth.js';
import { ShareService, ShareServiceError } from '../services/share.service.js';
import { error, ErrorCode, paginated, success } from '../utils/response.js';
import { parseJsonBody } from '../utils/validation.js';

const shares = new Hono();
const shareService = new ShareService();

const sourceSnapshotSchema = z.object({
  promptId: z.string().trim().min(1).nullable().optional(),
  promptTitle: z.string().max(200).nullable().optional(),
  systemPrompt: z.string().max(100000).nullable().optional(),
  userPrompt: z.string().max(100000).nullable().optional(),
  messageRole: z.enum(['system', 'user', 'assistant']).nullable().optional(),
  messageContent: z.string().max(100000).nullable().optional(),
  messageCreatedAt: z.string().trim().min(1).nullable().optional(),
});

const createShareSchema = z.object({
  visibility: z.enum(['private', 'shared']).optional(),
  title: z.string().trim().min(1, 'title is required').max(200, 'title is too long'),
  description: z.string().max(5000).optional(),
  content: z.string().min(1, 'content is required').max(200000, 'content is too long'),
  tags: z.array(z.string().trim().min(1)).optional(),
  folderId: z.string().trim().min(1).nullable().optional(),
  source: z.string().max(5000).optional(),
  notes: z.string().max(20000).optional(),
  isSharingEnabled: z.boolean().optional(),
  sourceSnapshot: sourceSnapshotSchema.nullable().optional(),
});

const updateShareSchema = createShareSchema.partial().extend({
  isFavorite: z.boolean().optional(),
});

const listQuerySchema = z.object({
  scope: z.enum(['private', 'shared', 'all']).optional(),
  keyword: z.string().optional(),
  tags: z.string().optional(),
  folderId: z.string().optional(),
  isFavorite: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['title', 'createdAt', 'updatedAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

shares.post('/', async (c) => {
  const parsed = await parseJsonBody(c, createShareSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, shareService.create(getAuthUser(c), parsed.data), 201);
  } catch (routeError) {
    return toShareErrorResponse(c, routeError);
  }
});

shares.get('/', async (c) => {
  const parsed = listQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    return error(c, 422, ErrorCode.VALIDATION_ERROR, message);
  }

  const query = parsed.data;
  const normalizedQuery = {
    scope: query.scope,
    keyword: query.keyword,
    tags: query.tags ? query.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
    folderId: query.folderId,
    isFavorite:
      query.isFavorite === undefined ? undefined : query.isFavorite === 'true',
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    limit: query.limit,
    offset: query.offset,
  };

  try {
    const data = shareService.list(getAuthUser(c), normalizedQuery);
    return paginated(c, data, {
      total: data.length,
      limit: normalizedQuery.limit ?? data.length,
      offset: normalizedQuery.offset ?? 0,
    });
  } catch (routeError) {
    return toShareErrorResponse(c, routeError);
  }
});

shares.get('/:id', async (c) => {
  try {
    return success(c, shareService.getById(getAuthUser(c), c.req.param('id')));
  } catch (routeError) {
    return toShareErrorResponse(c, routeError);
  }
});

shares.put('/:id', async (c) => {
  const parsed = await parseJsonBody(c, updateShareSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    return success(c, shareService.update(getAuthUser(c), c.req.param('id'), parsed.data));
  } catch (routeError) {
    return toShareErrorResponse(c, routeError);
  }
});

shares.delete('/:id', async (c) => {
  try {
    shareService.delete(getAuthUser(c), c.req.param('id'));
    return success(c, { ok: true });
  } catch (routeError) {
    return toShareErrorResponse(c, routeError);
  }
});

function toShareErrorResponse(c: Context, routeError: unknown): Response {
  if (routeError instanceof ShareServiceError) {
    return error(c, routeError.status, routeError.code, routeError.message);
  }

  return error(c, 500, ErrorCode.INTERNAL_ERROR, 'Internal server error');
}

export default shares;
