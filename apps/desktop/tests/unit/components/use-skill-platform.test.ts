import { describe, expect, it } from "vitest";

import { sortSkillPlatformsByPreference } from "../../../src/renderer/components/skill/use-skill-platform";

describe("use-skill-platform helpers", () => {
  it("sorts detected platforms by the saved user preference", () => {
    const sorted = sortSkillPlatformsByPreference(
      [
        { id: "cursor", name: "Cursor" },
        { id: "claude", name: "Claude Code" },
        { id: "opencode", name: "OpenCode" },
      ] as any,
      ["opencode", "claude"],
    );

    expect(sorted.map((platform) => platform.id)).toEqual([
      "opencode",
      "claude",
      "cursor",
    ]);
  });

  it("keeps the original order when no preference is saved", () => {
    const original = [
      { id: "claude", name: "Claude Code" },
      { id: "cursor", name: "Cursor" },
    ] as any;

    const sorted = sortSkillPlatformsByPreference(original, []);

    expect(sorted).toEqual(original);
  });
});
