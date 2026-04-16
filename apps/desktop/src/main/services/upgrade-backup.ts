import fs from "fs";
import path from "path";

const UPGRADE_BACKUP_ROOT_NAME = "PromptHub-upgrade-backups";
const MANIFEST_FILE_NAME = "backup-manifest.json";

export interface UpgradeBackupSnapshot {
  backupPath: string;
  createdAt: string;
  version: string;
  copiedItems: string[];
}

function formatTimestampForPath(timestamp: string): string {
  return timestamp.replace(/[:.]/g, "-");
}

function sanitizeVersion(version: string): string {
  return version.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export function getUpgradeBackupRoot(userDataPath: string): string {
  return path.join(path.dirname(userDataPath), UPGRADE_BACKUP_ROOT_NAME);
}

export async function createUpgradeDataSnapshot(
  userDataPath: string,
  version: string,
): Promise<UpgradeBackupSnapshot> {
  if (!userDataPath || userDataPath.trim().length === 0) {
    throw new Error("Cannot create upgrade backup without a user data path");
  }

  const resolvedUserDataPath = path.resolve(userDataPath);
  if (!fs.existsSync(resolvedUserDataPath)) {
    throw new Error(
      `Cannot create upgrade backup because the user data path does not exist: ${resolvedUserDataPath}`,
    );
  }

  const entries = await fs.promises.readdir(resolvedUserDataPath, {
    withFileTypes: true,
  });
  const copiedItems = entries
    .map((entry) => entry.name)
    .filter((entryName) => entryName !== UPGRADE_BACKUP_ROOT_NAME);

  if (copiedItems.length === 0) {
    throw new Error(
      `Cannot create upgrade backup because the user data path is empty: ${resolvedUserDataPath}`,
    );
  }

  const createdAt = new Date().toISOString();
  const backupRoot = getUpgradeBackupRoot(resolvedUserDataPath);
  const backupPath = path.join(
    backupRoot,
    `v${sanitizeVersion(version)}-${formatTimestampForPath(createdAt)}`,
  );

  await fs.promises.mkdir(backupPath, { recursive: true });

  for (const entryName of copiedItems) {
    const sourcePath = path.join(resolvedUserDataPath, entryName);
    const targetPath = path.join(backupPath, entryName);
    await fs.promises.cp(sourcePath, targetPath, {
      recursive: true,
      preserveTimestamps: true,
      errorOnExist: true,
      force: false,
    });
  }

  const manifest = {
    kind: "prompthub-upgrade-backup",
    createdAt,
    version,
    sourcePath: resolvedUserDataPath,
    copiedItems,
    platform: process.platform,
  };

  await fs.promises.writeFile(
    path.join(backupPath, MANIFEST_FILE_NAME),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  return {
    backupPath,
    createdAt,
    version,
    copiedItems,
  };
}
