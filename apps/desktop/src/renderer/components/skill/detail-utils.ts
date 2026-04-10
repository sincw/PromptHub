import type { TFunction } from "i18next";
import type {
  SafetyScanAIConfig,
  Skill,
  SkillVersion,
} from "@prompthub/shared/types";
import type { SkillPlatform } from "@prompthub/shared/constants/platforms";
import type { AIModelConfig } from "../../stores/settings.store";

export const SKILL_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

interface ImmersiveSegment {
  type: "original" | "translation";
  text: string;
}

/**
 * Strip YAML frontmatter from SKILL.md content.
 * 从 SKILL.md 内容中剥离 YAML frontmatter。
 */
export function stripFrontmatter(content: string): string {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return trimmed;

  const endIdx = trimmed.indexOf("---", 3);
  if (endIdx === -1) return trimmed;
  return trimmed.slice(endIdx + 3).trim();
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export interface SkillSourceMeta {
  kind: "github" | "remote" | "local";
  value: string;
  displayValue: string;
  shortValue: string;
  sourceLabel: string;
}

export interface DiffLine {
  type: "add" | "remove" | "unchanged";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export function getProtocolDisplayLabel(
  protocolType: Skill["protocol_type"],
): string {
  switch (protocolType) {
    case "skill":
      return "SKILL.md";
    case "mcp":
      return "MCP";
    case "claude-code":
      return "Claude Code";
    default:
      return protocolType;
  }
}

export function getSkillSourceMeta(
  skill: Skill,
  t?: TFunction,
): SkillSourceMeta | null {
  const sourceValue = skill.source_url || skill.local_repo_path;
  if (!sourceValue) {
    return null;
  }

  if (/^https?:\/\/github\.com\//i.test(sourceValue)) {
    return {
      kind: "github",
      value: sourceValue,
      displayValue: sourceValue.replace(
        /^https?:\/\/(www\.)?github\.com\//i,
        "",
      ),
      shortValue: sourceValue.replace(/^https?:\/\/(www\.)?github\.com\//i, ""),
      sourceLabel:
        t?.(
          skill.registry_slug
            ? "skill.sourceGithubStore"
            : "skill.sourceGithubRepo",
          skill.registry_slug
            ? "Imported from GitHub / Skill Store"
            : "Imported from GitHub Repository",
        ) ||
        (skill.registry_slug
          ? "Imported from GitHub / Skill Store"
          : "Imported from GitHub Repository"),
    };
  }

  if (/^https?:\/\//i.test(sourceValue)) {
    return {
      kind: "remote",
      value: sourceValue,
      displayValue: sourceValue.replace(/^https?:\/\/(www\.)?/i, ""),
      shortValue: sourceValue.replace(/^https?:\/\/(www\.)?/i, ""),
      sourceLabel:
        t?.(
          skill.registry_slug
            ? "skill.sourceRemoteStore"
            : "skill.sourceRemoteLink",
          skill.registry_slug
            ? "Imported from Remote Skill Store"
            : "Imported from Remote Link",
        ) ||
        (skill.registry_slug
          ? "Imported from Remote Skill Store"
          : "Imported from Remote Link"),
    };
  }

  const normalized = sourceValue.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const shortValue =
    parts.length >= 2
      ? `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`
      : sourceValue;
  const lowerPath = normalized.toLowerCase();
  let sourceLabel =
    t?.("skill.sourceLocalFolder", "Imported from Local Folder") ||
    "Imported from Local Folder";
  if (lowerPath.includes("/.claude/skills/")) {
    sourceLabel =
      t?.(
        "skill.sourceClaudeLocalFolder",
        "Imported from Claude Code Local Skills Folder",
      ) || "Imported from Claude Code Local Skills Folder";
  } else if (
    lowerPath.includes("/cursor/") ||
    lowerPath.includes("/.cursor/")
  ) {
    sourceLabel =
      t?.(
        "skill.sourceCursorLocalFolder",
        "Imported from Cursor Local Skills Folder",
      ) || "Imported from Cursor Local Skills Folder";
  }

  return {
    kind: "local",
    value: sourceValue,
    displayValue: sourceValue,
    shortValue,
    sourceLabel,
  };
}

export function renderImmersiveSegments(raw: string): ImmersiveSegment[] {
  const lines = raw.split("\n");
  const segments: ImmersiveSegment[] = [];
  let buffer: string[] = [];
  let currentType: ImmersiveSegment["type"] = "original";

  const flush = () => {
    const joined = buffer.join("\n");
    if (joined.trim()) {
      segments.push({ type: currentType, text: joined });
    }
    buffer = [];
  };

  for (const line of lines) {
    const translationMatch = line.match(/^<t>(.*)<\/t>$/);
    if (translationMatch) {
      flush();
      currentType = "translation";
      buffer.push(translationMatch[1]);
      flush();
      currentType = "original";
      continue;
    }
    buffer.push(line);
  }

  flush();
  return segments;
}

export function downloadSkillExport(
  content: string,
  skillName: string,
  format: "skillmd" | "json",
): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    format === "skillmd" ? `${skillName}-SKILL.md` : `${skillName}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export async function restoreSkillVersion(
  skillId: string,
  version: SkillVersion,
  reloadSkills: () => Promise<void>,
): Promise<void> {
  await window.api.skill.versionRollback(skillId, version.version);
  await reloadSkills();
}

function computeLcs(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => 0),
  );

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

export function generateTextDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");

  if (oldText === newText) {
    return oldLines.map((line, index) => ({
      type: "unchanged",
      content: line,
      oldLineNum: index + 1,
      newLineNum: index + 1,
    }));
  }

  const dp = computeLcs(oldLines, newLines);
  const stack: DiffLine[] = [];
  const diff: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: "add",
        content: newLines[j - 1],
        newLineNum: j,
      });
      j -= 1;
    } else if (i > 0) {
      stack.push({
        type: "remove",
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i -= 1;
    }
  }

  while (stack.length > 0) {
    diff.push(stack.pop()!);
  }

  return diff;
}

function normalizeInlineText(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFrontmatterValue(content: string, key: string): string | null {
  const trimmed = content.trim();
  if (!trimmed.startsWith("---")) return null;

  const frontmatterMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!frontmatterMatch) return null;

  const line = frontmatterMatch[1]
    .split("\n")
    .find((entry) => entry.trim().startsWith(`${key}:`));

  if (!line) return null;

  let value = line
    .trim()
    .slice(key.length + 1)
    .trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  return normalizeInlineText(value) || null;
}

function extractBodySummary(content: string): string | null {
  const stripped = stripFrontmatter(content);
  if (!stripped) return null;

  const paragraphs = stripped
    .split(/\n\s*\n/)
    .map((paragraph) => normalizeInlineText(paragraph))
    .filter((paragraph) => {
      if (!paragraph) return false;
      if (paragraph.startsWith("#")) return false;
      if (paragraph.startsWith("|")) return false;
      if (paragraph.startsWith("```")) return false;
      if (
        /^(quick reference|reading content|editing content|create from scratch)$/i.test(
          paragraph,
        )
      ) {
        return false;
      }
      return paragraph.length >= 24;
    });

  return paragraphs[0] || null;
}

export function resolveSkillDescription(instructions?: string): string {
  if (!instructions?.trim()) {
    return "";
  }

  const frontmatterDescription = extractFrontmatterValue(
    instructions,
    "description",
  );
  if (frontmatterDescription) {
    return frontmatterDescription;
  }

  const bodySummary = extractBodySummary(instructions);
  if (bodySummary) {
    return bodySummary;
  }

  return "";
}

/**
 * Extract a SafetyScanAIConfig from the user's configured AI models.
 * Returns the default chat model config, or undefined if none is available.
 */
export function getSafetyScanAIConfig(
  aiModels: AIModelConfig[],
): SafetyScanAIConfig | undefined {
  const chatModels = aiModels.filter((m) => (m.type ?? "chat") === "chat");
  const model = chatModels.find((m) => m.isDefault) ?? chatModels[0];
  if (!model?.apiKey || !model?.apiUrl || !model?.model) {
    return undefined;
  }
  return {
    provider: model.provider,
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    model: model.model,
  };
}
