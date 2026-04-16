import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DatabaseBackup } from "../../../src/renderer/services/database-backup-format";

const {
  exportDatabaseMock,
  restoreFromBackupMock,
  getSettingsStateMock,
} = vi.hoisted(() => ({
  exportDatabaseMock: vi.fn(),
  restoreFromBackupMock: vi.fn(),
  getSettingsStateMock: vi.fn(),
}));

vi.mock("../../../src/renderer/services/database-backup", () => ({
  exportDatabase: exportDatabaseMock,
  restoreFromBackup: restoreFromBackupMock,
}));

vi.mock("../../../src/renderer/stores/settings.store", () => ({
  useSettingsStore: {
    getState: getSettingsStateMock,
  },
}));

import {
  pullFromSelfHostedWeb,
  pushToSelfHostedWeb,
  testSelfHostedConnection,
} from "../../../src/renderer/services/self-hosted-sync";

function jsonResponse(payload: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

describe("self-hosted-sync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    window.localStorage.clear();
    window.electron = {
      updater: {
        getVersion: vi.fn().mockResolvedValue("0.5.2"),
      },
    } as typeof window.electron;

    getSettingsStateMock.mockReturnValue({
      themeMode: "light",
      language: "zh",
      autoSave: true,
      settingsUpdatedAt: "2026-04-16T00:00:00.000Z",
    });
  });

  it("tests the remote self-hosted connection through login and manifest", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/manifest")) {
        return jsonResponse({
          data: {
            counts: {
              prompts: 4,
              folders: 2,
              skills: 3,
            },
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      testSelfHostedConnection({
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 4,
      folders: 2,
      skills: 3,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://backup.example.com/api/auth/login",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://backup.example.com/api/devices/heartbeat",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://backup.example.com/api/sync/manifest",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer access-token",
        }),
      }),
    );
  });

  it("pushes desktop backup data and uploads media before syncing payload", async () => {
    const backup: DatabaseBackup = {
      version: 1,
      exportedAt: "2026-04-16T01:02:03.000Z",
      prompts: [
        {
          id: "prompt-1",
          title: "Prompt One",
          description: "",
          promptType: "text",
          userPrompt: "Body",
          variables: [],
          tags: [],
          folderId: "folder-1",
          images: ["local-image.png"],
          videos: ["local-video.mp4"],
          isFavorite: false,
          isPinned: false,
          version: 1,
          currentVersion: 1,
          usageCount: 0,
          createdAt: "2026-04-16T01:02:03.000Z",
          updatedAt: "2026-04-16T01:02:03.000Z",
        },
      ],
      folders: [
        {
          id: "folder-1",
          name: "Folder One",
          order: 0,
          createdAt: "2026-04-16T01:02:03.000Z",
          updatedAt: "2026-04-16T01:02:03.000Z",
        },
      ],
      versions: [],
      images: {
        "local-image.png": "image-base64",
      },
      videos: {
        "local-video.mp4": "video-base64",
      },
      settings: {
        state: {
          themeMode: "dark",
          language: "en",
          autoSave: false,
          customSkillPlatformPaths: { claude: "/tmp/skills" },
        },
      },
      skills: [
        {
          id: "skill-1",
          name: "Skill One",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      skillVersions: [],
    };

    exportDatabaseMock.mockResolvedValue(backup);

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/media/images/base64")) {
        return jsonResponse({ data: "remote-image.png" });
      }

      if (url.endsWith("/api/media/videos/base64")) {
        return jsonResponse({ data: "remote-video.mp4" });
      }

      if (url.endsWith("/api/sync/data")) {
        const parsedBody = JSON.parse(String(init?.body)) as {
          payload: {
            prompts: Array<{ images?: string[]; videos?: string[] }>;
            settings: {
              theme: string;
              language: string;
              autoSave: boolean;
              customSkillPlatformPaths: Record<string, string>;
            };
          };
        };

        expect(parsedBody.payload.prompts).toEqual([
          expect.objectContaining({
            images: ["remote-image.png"],
            videos: ["remote-video.mp4"],
          }),
        ]);
        expect(parsedBody.payload.settings).toEqual({
          theme: "dark",
          language: "en",
          autoSave: false,
          customSkillPlatformPaths: { claude: "/tmp/skills" },
          sync: {
            enabled: false,
            provider: "manual",
            autoSync: false,
          },
        });

        return jsonResponse({
          data: {
            ok: true,
            promptsImported: 1,
            foldersImported: 1,
            skillsImported: 1,
          },
        });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pushToSelfHostedWeb({
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 1,
      folders: 1,
      skills: 1,
    });

    expect(exportDatabaseMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backup.example.com/api/media/images/base64",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://backup.example.com/api/media/videos/base64",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("pulls remote workspace data and restores it back into desktop backup format", async () => {
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-16T01:00:00.000Z",
      prompts: [],
      folders: [],
      versions: [],
      settingsUpdatedAt: "2026-04-16T01:00:00.000Z",
    } satisfies DatabaseBackup);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/data")) {
        return jsonResponse({
          data: {
            version: "web-backup-v2",
            exportedAt: "2026-04-16T02:03:04.000Z",
            prompts: [
              {
                id: "prompt-remote",
                title: "Remote Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote body",
                variables: [],
                tags: [],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: ["remote-video.mp4"],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            promptVersions: [],
            folders: [
              {
                id: "folder-remote",
                name: "Remote Folder",
                order: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            skills: [
              {
                id: "skill-remote",
                name: "Remote Skill",
                protocol_type: "skill",
                is_favorite: false,
                created_at: 1,
                updated_at: 1,
              },
            ],
            skillVersions: [],
            settings: {
              theme: "dark",
              language: "en",
              autoSave: false,
              customSkillPlatformPaths: { claude: "/tmp/remote" },
            },
            settingsUpdatedAt: "2026-04-16T02:03:04.000Z",
          },
        });
      }

      if (url.endsWith("/api/media/images")) {
        return jsonResponse({ data: ["remote-image.png"] });
      }

      if (url.endsWith("/api/media/videos")) {
        return jsonResponse({ data: ["remote-video.mp4"] });
      }

      if (url.endsWith("/api/media/images/remote-image.png/base64")) {
        return jsonResponse({ data: "remote-image-base64" });
      }

      if (url.endsWith("/api/media/videos/remote-video.mp4/base64")) {
        return jsonResponse({ data: "remote-video-base64" });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      pullFromSelfHostedWeb({
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      }),
    ).resolves.toEqual({
      prompts: 1,
      folders: 1,
      skills: 1,
    });

    expect(restoreFromBackupMock).toHaveBeenCalledTimes(1);
    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: [
          expect.objectContaining({
            title: "Remote Prompt",
            images: ["remote-image.png"],
            videos: ["remote-video.mp4"],
          }),
        ],
        folders: [expect.objectContaining({ name: "Remote Folder" })],
        images: {
          "remote-image.png": "remote-image-base64",
        },
        videos: {
          "remote-video.mp4": "remote-video-base64",
        },
        settings: {
          state: expect.objectContaining({
            themeMode: "dark",
            language: "en",
            autoSave: false,
            settingsUpdatedAt: "2026-04-16T02:03:04.000Z",
          }),
        },
        skills: [expect.objectContaining({ name: "Remote Skill" })],
      }),
    );
  });

  it("merges divergent local and remote changes during pull and keeps the latest copy of shared entities", async () => {
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-16T01:00:00.000Z",
      prompts: [
        {
          id: "prompt-shared",
          title: "Local Shared Prompt",
          description: "",
          promptType: "text",
          userPrompt: "Local newer body",
          variables: [],
          tags: ["local"],
          folderId: "folder-local",
          images: ["local-image.png"],
          videos: [],
          isFavorite: false,
          isPinned: false,
          version: 1,
          currentVersion: 1,
          usageCount: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T03:00:00.000Z",
        },
      ],
      folders: [
        {
          id: "folder-local",
          name: "Local Folder",
          order: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T03:00:00.000Z",
        },
      ],
      versions: [
        {
          id: "prompt-shared-v1",
          promptId: "prompt-shared",
          version: 1,
          userPrompt: "Local newer body",
          variables: [],
          createdAt: "2026-04-16T03:00:00.000Z",
        },
      ],
      images: {
        "local-image.png": "local-image-base64",
      },
      settings: {
        state: {
          themeMode: "light",
          language: "zh",
          autoSave: true,
        },
      },
      settingsUpdatedAt: "2026-04-16T03:00:00.000Z",
      skills: [
        {
          id: "skill-local",
          name: "Local Skill",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 10,
        },
      ],
      skillVersions: [],
    } satisfies DatabaseBackup);

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/data")) {
        return jsonResponse({
          data: {
            version: "web-backup-v2",
            exportedAt: "2026-04-16T02:03:04.000Z",
            prompts: [
              {
                id: "prompt-shared",
                title: "Remote Shared Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote older body",
                variables: [],
                tags: ["remote"],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:00:00.000Z",
                updatedAt: "2026-04-16T02:00:00.000Z",
              },
              {
                id: "prompt-remote",
                title: "Remote Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote only body",
                variables: [],
                tags: ["remote"],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            promptVersions: [
              {
                id: "prompt-remote-v1",
                promptId: "prompt-remote",
                version: 1,
                userPrompt: "Remote only body",
                variables: [],
                createdAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            folders: [
              {
                id: "folder-remote",
                name: "Remote Folder",
                order: 1,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            skills: [
              {
                id: "skill-remote",
                name: "Remote Skill",
                protocol_type: "skill",
                is_favorite: false,
                created_at: 1,
                updated_at: 20,
              },
            ],
            skillVersions: [],
            settings: {
              theme: "dark",
              language: "en",
              autoSave: false,
              customSkillPlatformPaths: { claude: "/tmp/remote" },
            },
            settingsUpdatedAt: "2026-04-16T02:00:00.000Z",
          },
        });
      }

      if (url.endsWith("/api/media/images")) {
        return jsonResponse({ data: ["remote-image.png"] });
      }

      if (url.endsWith("/api/media/videos")) {
        return jsonResponse({ data: [] });
      }

      if (url.endsWith("/api/media/images/remote-image.png/base64")) {
        return jsonResponse({ data: "remote-image-base64" });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await pullFromSelfHostedWeb({
      url: "https://backup.example.com/",
      username: "owner",
      password: "secret",
    });

    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: expect.arrayContaining([
          expect.objectContaining({
            id: "prompt-shared",
            title: "Local Shared Prompt",
            userPrompt: "Local newer body",
          }),
          expect.objectContaining({
            id: "prompt-remote",
            title: "Remote Prompt",
          }),
        ]),
        folders: expect.arrayContaining([
          expect.objectContaining({ id: "folder-local", name: "Local Folder" }),
          expect.objectContaining({ id: "folder-remote", name: "Remote Folder" }),
        ]),
        images: {
          "local-image.png": "local-image-base64",
          "remote-image.png": "remote-image-base64",
        },
        settings: {
          state: expect.objectContaining({
            themeMode: "light",
            language: "zh",
            autoSave: true,
          }),
        },
        skills: expect.arrayContaining([
          expect.objectContaining({ id: "skill-local", name: "Local Skill" }),
          expect.objectContaining({ id: "skill-remote", name: "Remote Skill" }),
        ]),
      }),
    );
  });

  it("replaces the local workspace during pull when replace mode is requested", async () => {
    exportDatabaseMock.mockResolvedValue({
      version: 1,
      exportedAt: "2026-04-16T01:00:00.000Z",
      prompts: [
        {
          id: "prompt-local",
          title: "Local Prompt",
          description: "",
          promptType: "text",
          userPrompt: "Keep me only in merge mode",
          variables: [],
          tags: ["local"],
          folderId: "folder-local",
          images: ["local-image.png"],
          videos: [],
          isFavorite: false,
          isPinned: false,
          version: 1,
          currentVersion: 1,
          usageCount: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T01:00:00.000Z",
        },
      ],
      folders: [
        {
          id: "folder-local",
          name: "Local Folder",
          order: 0,
          createdAt: "2026-04-16T01:00:00.000Z",
          updatedAt: "2026-04-16T01:00:00.000Z",
        },
      ],
      versions: [],
      images: {
        "local-image.png": "local-image-base64",
      },
      aiConfig: {
        rootApiKey: "local-root-key",
      },
      skills: [
        {
          id: "skill-local",
          name: "Local Skill",
          protocol_type: "skill",
          is_favorite: false,
          created_at: 1,
          updated_at: 1,
        },
      ],
      skillVersions: [],
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.endsWith("/api/auth/login")) {
        return jsonResponse({
          data: { accessToken: "access-token" },
        });
      }

      if (url.endsWith("/api/devices/heartbeat")) {
        return jsonResponse({
          data: { ok: true },
        });
      }

      if (url.endsWith("/api/sync/data")) {
        return jsonResponse({
          data: {
            version: "web-backup-v2",
            exportedAt: "2026-04-16T02:03:04.000Z",
            prompts: [
              {
                id: "prompt-remote",
                title: "Remote Prompt",
                description: "",
                promptType: "text",
                userPrompt: "Remote only body",
                variables: [],
                tags: ["remote"],
                folderId: "folder-remote",
                images: ["remote-image.png"],
                videos: [],
                isFavorite: false,
                isPinned: false,
                version: 1,
                currentVersion: 1,
                usageCount: 0,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            promptVersions: [
              {
                id: "prompt-remote-v1",
                promptId: "prompt-remote",
                version: 1,
                userPrompt: "Remote only body",
                variables: [],
                createdAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            folders: [
              {
                id: "folder-remote",
                name: "Remote Folder",
                order: 1,
                createdAt: "2026-04-16T02:03:04.000Z",
                updatedAt: "2026-04-16T02:03:04.000Z",
              },
            ],
            skills: [
              {
                id: "skill-remote",
                name: "Remote Skill",
                protocol_type: "skill",
                is_favorite: false,
                created_at: 1,
                updated_at: 20,
              },
            ],
            skillVersions: [],
            settings: {
              theme: "dark",
              language: "en",
              autoSave: false,
              customSkillPlatformPaths: {},
              sync: {
                enabled: false,
                provider: "manual",
                autoSync: false,
              },
            },
            settingsUpdatedAt: "2026-04-16T02:03:04.000Z",
          },
        });
      }

      if (url.endsWith("/api/media/images")) {
        return jsonResponse({ data: ["remote-image.png"] });
      }

      if (url.endsWith("/api/media/videos")) {
        return jsonResponse({ data: [] });
      }

      if (url.endsWith("/api/media/images/remote-image.png/base64")) {
        return jsonResponse({ data: "remote-image-base64" });
      }

      throw new Error(`Unexpected request: ${url}`);
    });

    vi.stubGlobal("fetch", fetchMock);

    await pullFromSelfHostedWeb(
      {
        url: "https://backup.example.com/",
        username: "owner",
        password: "secret",
      },
      { mode: "replace" },
    );

    expect(restoreFromBackupMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prompts: [
          expect.objectContaining({
            id: "prompt-remote",
            title: "Remote Prompt",
          }),
        ],
        folders: [
          expect.objectContaining({ id: "folder-remote", name: "Remote Folder" }),
        ],
        versions: [
          expect.objectContaining({
            promptId: "prompt-remote",
            version: 1,
          }),
        ],
        images: {
          "remote-image.png": "remote-image-base64",
        },
        aiConfig: {
          rootApiKey: "local-root-key",
        },
        skills: [
          expect.objectContaining({ id: "skill-remote", name: "Remote Skill" }),
        ],
      }),
    );
  });
});
