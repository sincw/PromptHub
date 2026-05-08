import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCompletion } from "../../../vendor/renderer/services/ai";

const baseConfig = {
  provider: "openai",
  apiKey: "test-key",
  apiUrl: "https://example.test/v1",
  model: "test-model",
};

function installAiTransport(
  transport: NonNullable<Window["api"]>["ai"],
) {
  Object.defineProperty(window, "api", {
    configurable: true,
    value: {
      ai: transport,
    },
  });
}

describe("renderer ai service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(window, "api");
  });

  it("parses a non-SSE JSON response returned from streaming transport", async () => {
    const onComplete = vi.fn();
    installAiTransport({
      request: vi.fn(),
      requestStream: vi.fn(async (_request, handlers) => {
        handlers?.onChunk?.(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "complete json body",
                },
              },
            ],
          }),
        );
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: "complete json body",
                },
              },
            ],
          }),
        };
      }),
    });

    const result = await chatCompletion(
      baseConfig,
      [{ role: "user", content: "hello" }],
      {
        stream: true,
        streamCallbacks: {
          onComplete,
        },
      },
    );

    expect(result.content).toBe("complete json body");
    expect(onComplete).toHaveBeenCalledWith("complete json body", undefined);
  });
});
