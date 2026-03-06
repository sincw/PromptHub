import { describe, expect, it, vi } from "vitest";
import {
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
});
