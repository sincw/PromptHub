import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

export type MediaKind = 'images' | 'videos';

function ensureDir(targetPath: string): void {
  fs.mkdirSync(targetPath, { recursive: true });
}

function getLegacyMediaRoot(): string {
  return path.join(config.dataDir, 'media');
}

function getWorkspaceAssetsRoot(): string {
  return path.join(config.dataDir, 'workspace', 'assets');
}

function getLegacyKindDir(userId: string, kind: MediaKind): string {
  return path.join(getLegacyMediaRoot(), userId, kind);
}

export function getMediaDir(userId: string, kind: MediaKind): string {
  return path.join(getWorkspaceAssetsRoot(), userId, kind);
}

function migrateLegacyMediaKindDir(userId: string, kind: MediaKind): number {
  const legacyDir = getLegacyKindDir(userId, kind);
  if (!fs.existsSync(legacyDir)) {
    return 0;
  }

  const targetDir = getMediaDir(userId, kind);
  ensureDir(targetDir);

  let migratedFileCount = 0;
  for (const entry of fs.readdirSync(legacyDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const legacyPath = path.join(legacyDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (!fs.existsSync(targetPath)) {
      fs.renameSync(legacyPath, targetPath);
      migratedFileCount += 1;
      continue;
    }

    fs.rmSync(legacyPath, { force: true });
  }

  try {
    fs.rmSync(legacyDir, { recursive: false });
  } catch {
    // Ignore non-empty or already-removed legacy directories.
  }

  return migratedFileCount;
}

export function migrateLegacyMediaWorkspace(): { migratedFileCount: number } {
  const legacyRoot = getLegacyMediaRoot();
  if (!fs.existsSync(legacyRoot)) {
    return { migratedFileCount: 0 };
  }

  let migratedFileCount = 0;
  for (const userEntry of fs.readdirSync(legacyRoot, { withFileTypes: true })) {
    if (!userEntry.isDirectory()) {
      continue;
    }

    const userDir = path.join(legacyRoot, userEntry.name);
    for (const kindEntry of fs.readdirSync(userDir, { withFileTypes: true })) {
      if (!kindEntry.isDirectory()) {
        continue;
      }

      if (kindEntry.name === 'images' || kindEntry.name === 'videos') {
        migratedFileCount += migrateLegacyMediaKindDir(
          userEntry.name,
          kindEntry.name,
        );
      }
    }
  }

  return { migratedFileCount };
}

export function ensureMediaDir(userId: string, kind: MediaKind): string {
  migrateLegacyMediaKindDir(userId, kind);
  const dirPath = getMediaDir(userId, kind);
  ensureDir(dirPath);
  return dirPath;
}
