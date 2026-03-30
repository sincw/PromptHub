import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../src/main/database", () => ({
  initDatabase: vi.fn(),
}));

import { initDatabase } from "../../../src/main/database";
import { getPlatformById } from "../../../src/shared/constants/platforms";
import { getPlatformSkillsDir } from "../../../src/main/services/skill-installer-utils";

describe("skill-installer-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the saved platform override when one exists", () => {
    const getMock = vi.fn().mockReturnValue({
      value: JSON.stringify({ trae: "~/.trae-cn/skills" }),
    });
    vi.mocked(initDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({ get: getMock }),
    } as any);

    const platform = getPlatformById("trae");
    expect(platform).toBeDefined();

    const resolvedPath = getPlatformSkillsDir(platform!);

    expect(getMock).toHaveBeenCalledWith("customSkillPlatformPaths");
    expect(resolvedPath).toContain(".trae-cn/skills");
  });

  it("falls back to the built-in platform path when no override exists", () => {
    const getMock = vi.fn().mockReturnValue(undefined);
    vi.mocked(initDatabase).mockReturnValue({
      prepare: vi.fn().mockReturnValue({ get: getMock }),
    } as any);

    const platform = getPlatformById("trae");
    expect(platform).toBeDefined();

    const resolvedPath = getPlatformSkillsDir(platform!);

    expect(resolvedPath).toContain(".trae/skills");
  });
});
