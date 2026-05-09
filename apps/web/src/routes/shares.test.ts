import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase } from '@prompthub/db';

const ENV_KEYS = [
  'PORT',
  'HOST',
  'JWT_SECRET',
  'JWT_ACCESS_TTL',
  'JWT_REFRESH_TTL',
  'DATA_ROOT',
  'ALLOW_REGISTRATION',
  'LOG_LEVEL',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

async function createTestApp(dataDir: string) {
  process.env.PORT = '3995';
  process.env.HOST = '127.0.0.1';
  process.env.JWT_SECRET = 'test-secret-for-web-share-flow-1234567890';
  process.env.JWT_ACCESS_TTL = '900';
  process.env.JWT_REFRESH_TTL = '604800';
  process.env.DATA_ROOT = dataDir;
  process.env.ALLOW_REGISTRATION = 'true';
  process.env.LOG_LEVEL = 'debug';

  const [{ createApp }] = await Promise.all([
    import('../app'),
  ]);

  return createApp();
}

async function registerUser(app: Awaited<ReturnType<typeof createTestApp>>) {
  const response = await app.request(
    new Request('http://local/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'shareowner', password: 'debugpass001' }),
    }),
  );

  const payload = await response.json() as {
    data: {
      accessToken: string;
    };
  };

  return payload.data.accessToken;
}

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

describe('web share routes', () => {
  const TEST_TIMEOUT = 45000;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    closeDatabase();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('creates an enabled share and hides content after sharing is disabled', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompthub-web-share-test-'));

    try {
      const app = await createTestApp(dataDir);
      const token = await registerUser(app);

      const createResponse = await app.request(
        new Request('http://local/api/shares', {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({
            title: 'Launch Notes',
            description: 'Public markdown notes',
            content: '# Launch\n\nShip it.',
            tags: ['release'],
            isSharingEnabled: true,
            sourceSnapshot: {
              promptId: 'prompt-1',
              promptTitle: 'Release Prompt',
              systemPrompt: 'You write release notes.',
              userPrompt: 'Summarize the launch.',
              messageRole: 'assistant',
              messageContent: 'Ship it.',
              messageCreatedAt: '2026-05-09T00:00:00.000Z',
            },
          }),
        }),
      );

      expect(createResponse.status).toBe(201);
      const createPayload = await createResponse.json() as {
        data: {
          id: string;
          shareId: string;
          title: string;
          isSharingEnabled: boolean;
          sourceSnapshot?: { systemPrompt?: string | null };
        };
      };
      expect(createPayload.data.title).toBe('Launch Notes');
      expect(createPayload.data.isSharingEnabled).toBe(true);
      expect(createPayload.data.sourceSnapshot?.systemPrompt).toBe('You write release notes.');

      const publicResponse = await app.request(`http://local/api/public/shares/${createPayload.data.shareId}`);
      expect(publicResponse.status).toBe(200);
      const publicPayload = await publicResponse.json() as {
        data: {
          available: boolean;
          title?: string;
          content?: string;
          sourceSnapshot?: { userPrompt?: string | null };
        };
      };
      expect(publicPayload.data.available).toBe(true);
      expect(publicPayload.data.title).toBe('Launch Notes');
      expect(publicPayload.data.content).toContain('Ship it.');
      expect(publicPayload.data.sourceSnapshot?.userPrompt).toBe('Summarize the launch.');

      const updateResponse = await app.request(
        new Request(`http://local/api/shares/${createPayload.data.id}`, {
          method: 'PUT',
          headers: authHeaders(token),
          body: JSON.stringify({ isSharingEnabled: false }),
        }),
      );
      expect(updateResponse.status).toBe(200);

      const disabledResponse = await app.request(`http://local/api/public/shares/${createPayload.data.shareId}`);
      expect(disabledResponse.status).toBe(200);
      const disabledPayload = await disabledResponse.json() as {
        data: { available: boolean; title?: string; description?: string; content?: string };
      };
      expect(disabledPayload.data).toEqual({ available: false });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT);
});
