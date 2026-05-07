// @vitest-environment jsdom

import type { Folder } from '@prompthub/shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createFolder, updateFolder } from '../../vendor/renderer/services/database';

function createApiFolder(overrides: Partial<Folder> = {}): Folder {
  return {
    id: 'folder-1',
    name: 'Folder',
    order: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

describe('folder API parent payload normalization', () => {
  const createMock = vi.fn(async (data: Record<string, unknown>) =>
    createApiFolder({ name: String(data.name) }),
  );
  const updateMock = vi.fn(async (_id: string, data: Record<string, unknown>) =>
    createApiFolder({ name: String(data.name) }),
  );

  beforeEach(() => {
    createMock.mockClear();
    updateMock.mockClear();
    Reflect.set(window, 'api', {
      folder: {
        create: createMock,
        update: updateMock,
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(window, 'api');
  });

  it('omits null parentId before sending folder create and update calls to the web API', async () => {
    await createFolder({
      name: 'Root Folder',
      order: 0,
      parentId: null,
    } as unknown as Omit<Folder, 'id' | 'createdAt' | 'updatedAt'>);
    await updateFolder('folder-1', {
      name: 'Renamed Root Folder',
      parentId: null,
    });

    expect('parentId' in createMock.mock.calls[0][0]).toBe(false);
    expect('parentId' in updateMock.mock.calls[0][1]).toBe(false);
  });
});
