import type { Skill } from "../../../shared/types";
import type { SkillPlatform } from "../../../shared/constants/platforms";

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

export function getProtocolDisplayLabel(protocolType: Skill["protocol_type"]): string {
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

export function getSkillSourceMeta(skill: Skill): SkillSourceMeta | null {
  const sourceValue = skill.source_url || skill.local_repo_path;
  if (!sourceValue) {
    return null;
  }

  if (/^https?:\/\/github\.com\//i.test(sourceValue)) {
    return {
      kind: "github",
      value: sourceValue,
      displayValue: sourceValue.replace(/^https?:\/\/(www\.)?github\.com\//i, ""),
      shortValue: sourceValue.replace(/^https?:\/\/(www\.)?github\.com\//i, ""),
      sourceLabel: skill.registry_slug
        ? "从 GitHub / Skill 商店导入"
        : "从 GitHub 仓库导入",
    };
  }

  if (/^https?:\/\//i.test(sourceValue)) {
    return {
      kind: "remote",
      value: sourceValue,
      displayValue: sourceValue.replace(/^https?:\/\/(www\.)?/i, ""),
      shortValue: sourceValue.replace(/^https?:\/\/(www\.)?/i, ""),
      sourceLabel: skill.registry_slug
        ? "从远程 Skill 商店导入"
        : "从远程链接导入",
    };
  }

  const normalized = sourceValue.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  const shortValue =
    parts.length >= 2
      ? `.../${parts[parts.length - 2]}/${parts[parts.length - 1]}`
      : sourceValue;
  const lowerPath = normalized.toLowerCase();
  let sourceLabel = "从本地文件夹导入";
  if (lowerPath.includes("/.claude/skills/")) {
    sourceLabel = "从 Claude Code 本地技能目录导入";
  } else if (lowerPath.includes("/cursor/") || lowerPath.includes("/.cursor/")) {
    sourceLabel = "从 Cursor 本地技能目录导入";
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

  let value = line.trim().slice(key.length + 1).trim();
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
      if (/^(quick reference|reading content|editing content|create from scratch)$/i.test(paragraph)) {
        return false;
      }
      return paragraph.length >= 24;
    });

  return paragraphs[0] || null;
}

export function resolveSkillDescription(
  instructions?: string,
): string {
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
