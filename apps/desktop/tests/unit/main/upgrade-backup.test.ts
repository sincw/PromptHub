import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

import {
  createUpgradeDataSnapshot,
  getUpgradeBackupRoot,
} from "../../../src/main/services/upgrade-backup";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("upgrade-backup", () => {
  let tmpBase: string;

  beforeEach(() => {
    tmpBase = makeTmpDir("upgrade-backup-test-");
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it("copies the entire user data payload into a versioned snapshot directory", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub");
    fs.mkdirSync(userDataPath, { recursive: true });

    fs.writeFileSync(path.join(userDataPath, "prompthub.db"), "db-bytes");
    fs.mkdirSync(path.join(userDataPath, "skills", "demo-skill"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(userDataPath, "skills", "demo-skill", "SKILL.md"),
      "# skill",
    );
    fs.mkdirSync(path.join(userDataPath, "workspace"), { recursive: true });
    fs.writeFileSync(
      path.join(userDataPath, "workspace", "prompt-1.md"),
      "prompt body",
    );
    fs.mkdirSync(path.join(userDataPath, "IndexedDB"), { recursive: true });
    fs.writeFileSync(path.join(userDataPath, "IndexedDB", "LOG"), "renderer");
    fs.writeFileSync(
      path.join(userDataPath, "shortcut-mode.json"),
      '{"showApp":"global"}',
    );

    const snapshot = await createUpgradeDataSnapshot(userDataPath, "0.5.1");

    expect(snapshot.version).toBe("0.5.1");
    expect(snapshot.backupPath.startsWith(getUpgradeBackupRoot(userDataPath))).toBe(
      true,
    );
    expect(snapshot.copiedItems).toEqual(
      expect.arrayContaining([
        "prompthub.db",
        "skills",
        "workspace",
        "IndexedDB",
        "shortcut-mode.json",
      ]),
    );
    expect(
      fs.readFileSync(path.join(snapshot.backupPath, "prompthub.db"), "utf8"),
    ).toBe("db-bytes");
    expect(
      fs.readFileSync(
        path.join(snapshot.backupPath, "skills", "demo-skill", "SKILL.md"),
        "utf8",
      ),
    ).toBe("# skill");
    expect(
      fs.readFileSync(
        path.join(snapshot.backupPath, "workspace", "prompt-1.md"),
        "utf8",
      ),
    ).toBe("prompt body");

    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(snapshot.backupPath, "backup-manifest.json"),
        "utf8",
      ),
    ) as {
      kind: string;
      version: string;
      copiedItems: string[];
      sourcePath: string;
    };

    expect(manifest.kind).toBe("prompthub-upgrade-backup");
    expect(manifest.version).toBe("0.5.1");
    expect(manifest.sourcePath).toBe(path.resolve(userDataPath));
    expect(manifest.copiedItems).toEqual(snapshot.copiedItems);
  });

  it("fails when the user data path is empty", async () => {
    const userDataPath = path.join(tmpBase, "PromptHub-empty");
    fs.mkdirSync(userDataPath, { recursive: true });

    await expect(
      createUpgradeDataSnapshot(userDataPath, "0.5.1"),
    ).rejects.toThrow(/user data path is empty/i);
  });
});
