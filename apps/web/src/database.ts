import { closeDatabase, getDatabase, initDatabase } from '@prompthub/db';
import { getDatabasePath } from './runtime-paths.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let initialized = false;

export function getServerDatabase() {
  const databasePath = getDatabasePath();

  prepareTestDatabaseFromTemplate(databasePath);

  if (!initialized) {
    initDatabase(databasePath);
    initialized = true;
  }

  return getDatabase();
}

function prepareTestDatabaseFromTemplate(databasePath: string): void {
  if (process.env.PROMPTHUB_USE_TEST_DB_TEMPLATE !== 'true' || fs.existsSync(databasePath)) {
    return;
  }

  const templatePath = getTestDatabaseTemplatePath();
  ensureTestDatabaseTemplate(templatePath);

  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.copyFileSync(templatePath, databasePath);
}

function getTestDatabaseTemplatePath(): string {
  const workspaceHash = crypto
    .createHash('sha1')
    .update(process.cwd())
    .update(getTestDatabaseTemplateVersion())
    .digest('hex')
    .slice(0, 12);

  return path.join(os.tmpdir(), `prompthub-web-test-template-${workspaceHash}.db`);
}

function getTestDatabaseTemplateVersion(): string {
  const hash = crypto.createHash('sha1');
  const sourceUrls = [
    new URL('../../../packages/db/src/schema.ts', import.meta.url),
    new URL('../../../packages/db/src/init.ts', import.meta.url),
  ];

  for (const sourceUrl of sourceUrls) {
    hash.update(fs.readFileSync(sourceUrl));
  }

  return hash.digest('hex');
}

function ensureTestDatabaseTemplate(templatePath: string): void {
  if (fs.existsSync(templatePath)) {
    return;
  }

  const lockDir = `${templatePath}.building`;
  const startedAt = Date.now();

  while (true) {
    try {
      fs.mkdirSync(lockDir, { recursive: false });
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EEXIST') {
        throw error;
      }
      if (fs.existsSync(templatePath)) {
        return;
      }
      if (Date.now() - startedAt > 30000) {
        throw new Error(`Timed out waiting for test database template: ${templatePath}`);
      }
      sleepSync(50);
    }
  }

  try {
    if (!fs.existsSync(templatePath)) {
      fs.mkdirSync(path.dirname(templatePath), { recursive: true });
      initDatabase(templatePath);
      closeDatabase();
    }
  } finally {
    fs.rmSync(lockDir, { recursive: true, force: true });
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
