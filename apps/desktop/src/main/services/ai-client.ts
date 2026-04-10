/**
 * Lightweight AI client for the main process.
 * Used exclusively for safety scanning — keeps the surface area minimal.
 * Supports any OpenAI-compatible endpoint (OpenAI, Anthropic via proxy,
 * Gemini via OpenAI compat layer, etc.).
 */

import type { SafetyScanAIConfig } from "@prompthub/shared/types";

export interface AIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AIChatResult {
  content: string;
}

/**
 * Build the chat-completions endpoint URL from the user-supplied API URL.
 * Mirrors the logic in `renderer/services/ai.ts` but simplified for
 * non-streaming JSON requests only.
 */
function buildEndpoint(apiUrl: string): string {
  let endpoint = apiUrl.trim().replace(/\/$/, "");
  const isGemini = endpoint.includes("generativelanguage.googleapis.com");

  if (endpoint.endsWith("#")) {
    endpoint = endpoint.slice(0, -1);
    if (!endpoint.endsWith("/chat/completions")) {
      endpoint = endpoint.replace(/\/$/, "") + "/chat/completions";
    }
    return endpoint;
  }

  if (isGemini && endpoint.endsWith("/models")) {
    endpoint = endpoint.replace(/\/models$/, "");
  }

  if (endpoint.endsWith("/chat/completions")) {
    return endpoint;
  }

  if (isGemini) {
    if (endpoint.endsWith("/openai")) {
      return endpoint + "/chat/completions";
    }
    if (endpoint.match(/\/v\d+(?:beta)?$/)) {
      return endpoint + "/openai/chat/completions";
    }
    return endpoint + "/v1beta/openai/chat/completions";
  }

  if (endpoint.match(/\/v\d+$/)) {
    return endpoint + "/chat/completions";
  }

  return endpoint + "/v1/chat/completions";
}

/**
 * Build request headers for the given provider.
 */
function buildHeaders(config: SafetyScanAIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const isGemini = config.apiUrl.includes("generativelanguage.googleapis.com");

  if (config.provider === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (isGemini) {
    headers["x-goog-api-key"] = config.apiKey;
  } else {
    headers["Authorization"] = `Bearer ${config.apiKey}`;
  }

  return headers;
}

const AI_REQUEST_TIMEOUT_MS = 60_000;

/**
 * Send a non-streaming chat completion request and return the assistant
 * response content.  Throws on network/API errors.
 */
export async function chatCompletion(
  config: SafetyScanAIConfig,
  messages: AIChatMessage[],
  options?: {
    temperature?: number;
    maxTokens?: number;
    responseFormat?: { type: "text" | "json_object" };
  },
): Promise<AIChatResult> {
  if (!config.apiKey) {
    throw new Error("AI API Key is not configured");
  }
  if (!config.apiUrl) {
    throw new Error("AI API URL is not configured");
  }
  if (!config.model) {
    throw new Error("AI model is not configured");
  }

  const endpoint = buildEndpoint(config.apiUrl);
  const headers = buildHeaders(config);

  const isGemini = config.apiUrl.includes("generativelanguage.googleapis.com");
  const model = isGemini ? config.model.replace(/^models\//, "") : config.model;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 4096,
    stream: false,
  };

  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorMessage = `AI API request failed (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText) as Record<string, unknown>;
        const inner = errorJson.error as Record<string, unknown> | undefined;
        errorMessage =
          (inner?.message as string) ??
          (errorJson.message as string) ??
          errorMessage;
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };

    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new Error("AI API returned an unexpected response format");
    }

    return { content };
  } finally {
    clearTimeout(timeout);
  }
}
