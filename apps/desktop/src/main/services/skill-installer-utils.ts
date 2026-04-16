import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";
import { initDatabase } from "../database";
import type { MCPServerConfig } from "@prompthub/shared/types/skill";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type { Settings } from "@prompthub/shared/types";

export function validateMCPServerConfig(
  config: unknown,
  serverName: string,
): asserts config is MCPServerConfig {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(
      `Invalid MCP server config for "${serverName}": expected an object`,
    );
  }
  const candidate = config as Record<string, unknown>;
  if (typeof candidate.command !== "string" || !candidate.command.trim()) {
    throw new Error(
      `Invalid MCP server config for "${serverName}": "command" must be a non-empty string`,
    );
  }
  if (candidate.args !== undefined) {
    if (
      !Array.isArray(candidate.args) ||
      !candidate.args.every((value) => typeof value === "string")
    ) {
      throw new Error(
        `Invalid MCP server config for "${serverName}": "args" must be a string array`,
      );
    }
  }
  if (candidate.env !== undefined) {
    if (
      !candidate.env ||
      typeof candidate.env !== "object" ||
      Array.isArray(candidate.env)
    ) {
      throw new Error(
        `Invalid MCP server config for "${serverName}": "env" must be an object`,
      );
    }
    for (const [key, value] of Object.entries(
      candidate.env as Record<string, unknown>,
    )) {
      if (typeof value !== "string") {
        throw new Error(
          `Invalid MCP server config for "${serverName}": env["${key}"] must be a string`,
        );
      }
    }
  }
}

export function validateMCPConfig(config: unknown, name: string): void {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(
      `Invalid MCP config for "${name}": expected an object, got ${Array.isArray(config) ? "array" : typeof config}`,
    );
  }

  const candidate = config as Record<string, unknown>;
  if (candidate.servers !== undefined) {
    if (
      !candidate.servers ||
      typeof candidate.servers !== "object" ||
      Array.isArray(candidate.servers)
    ) {
      throw new Error(
        `Invalid MCP config for "${name}": "servers" must be an object`,
      );
    }
    for (const [serverName, serverConfig] of Object.entries(
      candidate.servers,
    )) {
      validateMCPServerConfig(serverConfig, serverName);
    }
    return;
  }

  validateMCPServerConfig(config, name);
}

const GIT_CLONE_TIMEOUT_MS = 60_000; // 60 seconds

export function gitClone(url: string, destDir: string): Promise<void> {
  if (!url.trim()) {
    throw new Error("Git clone URL cannot be empty");
  }
  if (url.startsWith("-")) {
    throw new Error("Git clone URL cannot start with '-'");
  }

  const parsedUrl = new URL(url);
  if (parsedUrl.protocol !== "https:") {
    throw new Error("Only HTTPS Git clone URLs are allowed");
  }

  return new Promise((resolve, reject) => {
    const proc = spawn("git", ["clone", "--depth", "1", "--", url, destDir], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        proc.kill("SIGKILL");
        reject(
          new Error(
            `Git clone timed out after ${GIT_CLONE_TIMEOUT_MS / 1000}s for URL: ${url}`,
          ),
        );
      }
    }, GIT_CLONE_TIMEOUT_MS);

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(new Error(`Git clone error: ${error.message}`));
    });
  });
}

export function resolvePlatformPath(template: string): string {
  const home = os.homedir();
  return template
    .replace(/^~/, home)
    .replace(/%USERPROFILE%/gi, home)
    .replace(/%APPDATA%/gi, path.join(home, "AppData", "Roaming"));
}

let _customPathsCache: Record<string, string> | null = null;
let _customPathsCacheTs = 0;
const CUSTOM_PATHS_CACHE_TTL = 5000; // 5 seconds

function readCustomSkillPlatformPaths(): Record<string, string> {
  const now = Date.now();
  if (_customPathsCache && now - _customPathsCacheTs < CUSTOM_PATHS_CACHE_TTL) {
    return _customPathsCache;
  }
  try {
    const db = initDatabase();
    if (!db || typeof db.prepare !== "function") {
      _customPathsCache = {};
      _customPathsCacheTs = now;
      return _customPathsCache;
    }
    const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
    const row = stmt.get("customSkillPlatformPaths") as
      | { value: string }
      | undefined;

    if (!row?.value) {
      _customPathsCache = {};
      _customPathsCacheTs = now;
      return _customPathsCache;
    }

    const parsed = JSON.parse(
      row.value,
    ) as Settings["customSkillPlatformPaths"];
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      _customPathsCache = {};
      _customPathsCacheTs = now;
      return _customPathsCache;
    }

    _customPathsCache = Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string",
      ),
    );
    _customPathsCacheTs = now;
    return _customPathsCache;
  } catch (error) {
    console.warn("Failed to read custom skill platform paths:", error);
    _customPathsCache = {};
    _customPathsCacheTs = now;
    return _customPathsCache;
  }
}

/**
 * Invalidate the cached custom platform paths so the next call reads from DB.
 */
export function invalidateCustomPathsCache(): void {
  _customPathsCache = null;
  _customPathsCacheTs = 0;
}

export function getPlatformSkillsDir(
  platform: SkillPlatform,
  overrides?: Record<string, string>,
): string {
  const overridePath =
    overrides?.[platform.id] ?? readCustomSkillPlatformPaths()[platform.id];

  if (typeof overridePath === "string" && overridePath.trim()) {
    return resolvePlatformPath(overridePath.trim());
  }

  const osKey = process.platform as "darwin" | "win32" | "linux";
  const template = platform.skillsDir[osKey] || platform.skillsDir.linux;
  return resolvePlatformPath(template);
}
