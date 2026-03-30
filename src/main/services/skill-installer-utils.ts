import { spawn } from "child_process";
import * as os from "os";
import * as path from "path";
import { initDatabase } from "../database";
import type { MCPServerConfig } from "../../shared/types/skill";
import type { SkillPlatform } from "../../shared/constants/platforms";
import type { Settings } from "../../shared/types";

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
    for (const [serverName, serverConfig] of Object.entries(candidate.servers)) {
      validateMCPServerConfig(serverConfig, serverName);
    }
    return;
  }

  validateMCPServerConfig(config, name);
}

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
    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Git clone failed with code ${code}: ${stderr}`));
      }
    });

    proc.on("error", (error) => {
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

function readCustomSkillPlatformPaths(): Record<string, string> {
  try {
    const db = initDatabase();
    const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
    const row = stmt.get("customSkillPlatformPaths") as
      | { value: string }
      | undefined;

    if (!row?.value) {
      return {};
    }

    const parsed = JSON.parse(row.value) as Settings["customSkillPlatformPaths"];
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) => typeof key === "string" && typeof value === "string",
      ),
    );
  } catch (error) {
    console.warn("Failed to read custom skill platform paths:", error);
    return {};
  }
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
