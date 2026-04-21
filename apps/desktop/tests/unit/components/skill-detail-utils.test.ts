import { describe, expect, it, vi } from "vitest";
import {
  generateTextDiff,
  getSkillSourceMeta,
  groupSkillSafetyFindings,
  resolveGitHubMarkdownBase,
  resolveGitHubMarkdownUrl,
  resolveSkillDescription,
  restoreSkillVersion,
  stripFrontmatter,
} from "../../../src/renderer/components/skill/detail-utils";

describe("skill detail utils", () => {
  it("strips YAML frontmatter and keeps markdown body", () => {
    const content = `---
name: demo
description: example
---

# Title

Body`;

    expect(stripFrontmatter(content)).toBe("# Title\n\nBody");
    expect(stripFrontmatter("plain content")).toBe("plain content");
  });

  it("extracts multiline block descriptions from frontmatter", () => {
    const content = `---
name: demo
description: |
  Line one.
  Line two.
---

# Title`;

    expect(resolveSkillDescription(content)).toBe("Line one. Line two.");
  });

  it("restores a version through window api and reloads skills", async () => {
    const versionRollback = vi.fn().mockResolvedValue(undefined);
    const loadSkills = vi.fn().mockResolvedValue(undefined);

    (window as any).api = {
      skill: {
        versionRollback,
      },
    };

    await restoreSkillVersion(
      "skill-1",
      {
        id: "version-1",
        skillId: "skill-1",
        version: 3,
        content: "snapshot",
        note: "restore me",
        createdAt: new Date().toISOString(),
      } as any,
      loadSkills,
    );

    expect(versionRollback).toHaveBeenCalledWith("skill-1", 3);
    expect(loadSkills).toHaveBeenCalledTimes(1);
  });

  it("generates git-style diff lines for version comparison", () => {
    expect(generateTextDiff("line1\nline2", "line1\nline3")).toEqual([
      { type: "unchanged", content: "line1", oldLineNum: 1, newLineNum: 1 },
      { type: "remove", content: "line2", oldLineNum: 2 },
      { type: "add", content: "line3", newLineNum: 2 },
    ]);
  });

  it("localizes skill source labels through i18n keys", () => {
    const t = vi.fn((key: string, fallback: string) => {
      const map: Record<string, string> = {
        "skill.sourceGithubStore": "Imported via Store",
        "skill.sourceCursorLocalFolder": "Imported from Cursor Folder",
      };
      return map[key] || fallback;
    });

    const github = getSkillSourceMeta(
      {
        source_url: "https://github.com/org/repo",
        registry_slug: "official/repo",
      } as any,
      t as any,
    );
    const local = getSkillSourceMeta(
      {
        local_repo_path: "/Users/demo/.cursor/skills/example",
      } as any,
      t as any,
    );

    expect(github?.sourceLabel).toBe("Imported via Store");
    expect(local?.sourceLabel).toBe("Imported from Cursor Folder");
  });

  it("resolves GitHub markdown base paths for repo subdirectories", () => {
    expect(
      resolveGitHubMarkdownBase(
        "https://github.com/anthropics/skills/tree/main/skills/pdf",
      ),
    ).toEqual({
      hrefBase: "https://github.com/anthropics/skills/blob/main/skills/pdf/",
      imageBase:
        "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/",
    });
  });

  it("rewrites relative markdown assets against GitHub repo paths", () => {
    const base = resolveGitHubMarkdownBase(
      "https://github.com/anthropics/skills/tree/main/skills/pdf",
    );

    expect(resolveGitHubMarkdownUrl("./images/demo.png", base, "image")).toBe(
      "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/images/demo.png",
    );
    expect(resolveGitHubMarkdownUrl("docs/setup.md", base, "link")).toBe(
      "https://github.com/anthropics/skills/blob/main/skills/pdf/docs/setup.md",
    );
  });

  it("groups repeated safety findings by code and severity", () => {
    const grouped = groupSkillSafetyFindings([
      {
        code: "script-file",
        severity: "warn",
        title: "Repository contains executable scripts",
        detail: "repo contains scripts",
        filePath: "scripts/a.ts",
        evidence: "scripts/a.ts",
      },
      {
        code: "script-file",
        severity: "warn",
        title: "Repository contains executable scripts",
        detail: "repo contains scripts",
        filePath: "scripts/b.ts",
        evidence: "scripts/b.ts",
      },
      {
        code: "secret-access",
        severity: "high",
        title: "Reads secret-bearing paths",
        detail: "references .env",
        filePath: "SKILL.md",
        evidence: ".env",
      },
    ] as any);

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({
      code: "secret-access",
      severity: "high",
      count: 1,
      filePaths: ["SKILL.md"],
    });
    expect(grouped[1]).toMatchObject({
      code: "script-file",
      severity: "warn",
      count: 2,
      filePaths: ["scripts/a.ts", "scripts/b.ts"],
    });
  });
});
