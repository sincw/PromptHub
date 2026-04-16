import path from 'node:path';
import { getDatabase, initDatabase } from '@prompthub/db';
import { config } from './config.js';

let initialized = false;

export function getServerDatabase() {
  if (!initialized) {
    initDatabase(path.join(config.dataDir, 'prompthub.db'));
    initialized = true;
  }

  return getDatabase();
}
