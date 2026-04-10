import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

import { getAppDataPath } from "./runtime-paths";

const execFileAsync = promisify(execFile);

export const DESKTOP_CLI_FLAG = "--cli";
const POSIX_BLOCK_BEGIN = "# >>> PromptHub CLI >>>";
const POSIX_BLOCK_END = "# <<< PromptHub CLI <<<";

export function extractDesktopCliArgs(argv: string[]): string[] | null {
  const cliFlagIndex = argv.indexOf(DESKTOP_CLI_FLAG);
  if (cliFlagIndex === -1) {
    return null;
  }

  return argv.slice(cliFlagIndex + 1);
}

export function getDesktopCliBinDir(
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === "win32") {
    return path.join(getAppDataPath(), "PromptHub", "bin");
  }

  return path.join(getAppDataPath(), "PromptHub", "bin");
}

function toPortableShellPath(targetPath: string): string {
  const homeDir = os.homedir();
  if (targetPath.startsWith(homeDir)) {
    return targetPath.replace(homeDir, "$HOME");
  }
  return targetPath;
}

export function renderPosixCliShim(executablePath: string): string {
  return `#!/bin/sh
exec "${executablePath}" ${DESKTOP_CLI_FLAG} "$@"
`;
}

export function renderWindowsCliShim(executablePath: string): string {
  return `@echo off\r
"${executablePath}" ${DESKTOP_CLI_FLAG} %*\r
`;
}

export function renderPosixPathBlock(binDir: string): string {
  const portableDir = toPortableShellPath(binDir);
  return `${POSIX_BLOCK_BEGIN}
if [ -d "${portableDir}" ]; then
  export PATH="${portableDir}:$PATH"
fi
${POSIX_BLOCK_END}`;
}

async function writeManagedShellBlock(
  profilePath: string,
  blockContent: string,
): Promise<void> {
  const existing = await fs.readFile(profilePath, "utf8").catch(() => "");
  const escapedBegin = POSIX_BLOCK_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedEnd = POSIX_BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const blockPattern = new RegExp(`${escapedBegin}[\\s\\S]*?${escapedEnd}\\n?`, "g");
  const normalized = existing.replace(blockPattern, "").trimEnd();
  const nextContent = `${normalized ? `${normalized}\n\n` : ""}${blockContent}\n`;

  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.writeFile(profilePath, nextContent, "utf8");
}

async function ensurePosixPathExport(binDir: string): Promise<void> {
  const homeDir = os.homedir();
  const profileFiles =
    process.platform === "darwin"
      ? [".zprofile", ".bash_profile", ".profile"]
      : [".bashrc", ".profile"];
  const block = renderPosixPathBlock(binDir);

  await Promise.all(
    profileFiles.map((profileName) =>
      writeManagedShellBlock(path.join(homeDir, profileName), block),
    ),
  );
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replace(/'/g, "''");
}

async function ensureWindowsUserPath(binDir: string): Promise<void> {
  const escapedDir = escapePowerShellSingleQuoted(binDir);
  const script = [
    `$target = '${escapedDir}'`,
    "$current = [Environment]::GetEnvironmentVariable('Path', 'User')",
    "if (-not $current) { $current = '' }",
    "$parts = @()",
    "if ($current) { $parts = $current -split ';' | Where-Object { $_ } }",
    "if ($parts -notcontains $target) {",
    "  $newPath = if ($current) { \"$current;$target\" } else { $target }",
    "  [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')",
    "}",
  ].join("; ");

  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
}

export async function ensureDesktopCliInstalled(
  executablePath: string = process.execPath,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const binDir = getDesktopCliBinDir(platform);
  const shimPath =
    platform === "win32"
      ? path.join(binDir, "prompthub.cmd")
      : path.join(binDir, "prompthub");

  await fs.mkdir(binDir, { recursive: true });

  if (platform === "win32") {
    await fs.writeFile(shimPath, renderWindowsCliShim(executablePath), "utf8");
    await ensureWindowsUserPath(binDir);
    return;
  }

  await fs.writeFile(shimPath, renderPosixCliShim(executablePath), "utf8");
  await fs.chmod(shimPath, 0o755);
  await ensurePosixPathExport(binDir);
}
