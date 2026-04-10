import { describe, expect, it } from "vitest";

import {
  DESKTOP_CLI_FLAG,
  extractDesktopCliArgs,
  renderPosixCliShim,
  renderPosixPathBlock,
  renderWindowsCliShim,
} from "../../../src/main/desktop-cli";

describe("desktop CLI helpers", () => {
  it("extracts CLI args after the desktop flag", () => {
    expect(
      extractDesktopCliArgs([
        "/Applications/PromptHub.app/Contents/MacOS/PromptHub",
        DESKTOP_CLI_FLAG,
        "prompt",
        "list",
      ]),
    ).toEqual(["prompt", "list"]);
  });

  it("returns null when desktop CLI flag is absent", () => {
    expect(extractDesktopCliArgs(["PromptHub", "prompt", "list"])).toBeNull();
  });

  it("renders a POSIX shim that forwards to the packaged executable", () => {
    expect(
      renderPosixCliShim("/Applications/PromptHub.app/Contents/MacOS/PromptHub"),
    ).toContain(
      'exec "/Applications/PromptHub.app/Contents/MacOS/PromptHub" --cli "$@"',
    );
  });

  it("renders a Windows shim that forwards to the packaged executable", () => {
    expect(
      renderWindowsCliShim(
        String.raw`C:\Users\foo\AppData\Local\Programs\PromptHub\PromptHub.exe`,
      ),
    ).toContain(
      String.raw`"C:\Users\foo\AppData\Local\Programs\PromptHub\PromptHub.exe" --cli %*`,
    );
  });

  it("renders a managed PATH block for POSIX shells", () => {
    const targetDir = "/Users/test/Library/Application Support/PromptHub/bin";
    const block = renderPosixPathBlock(targetDir);

    expect(block).toContain("# >>> PromptHub CLI >>>");
    expect(block).toContain(targetDir);
    expect(block).toContain(`export PATH="${targetDir}:$PATH"`);
  });
});
