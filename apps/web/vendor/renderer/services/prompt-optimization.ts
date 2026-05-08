import type {
  Prompt,
  PromptOptimizationFailureSummary,
  PromptOptimizationModelSnapshot,
  PromptOptimizationPromptContent,
  PromptOptimizationResult,
  PromptOptimizationSession,
} from "@prompthub/shared/types";
import type { AIModelConfig } from "../stores/settings.store";
import type { ChatMessage } from "./ai";

export const MAX_PROMPT_OPTIMIZATION_SESSIONS = 20;
export const MAX_PROMPT_OPTIMIZATION_AUTO_ITERATIONS = 3;
export const MAX_PROMPT_OPTIMIZATION_ITERATIONS = 10;

const FIXED_B_OPTIMIZER_PROTOCOL = `You are the B-side prompt optimization agent.

Fixed protocol:
- Do not ask follow-up questions.
- Do not pause for confirmation.
- Do not output Markdown, code fences, prose before JSON, or prose after JSON.
- Output exactly one valid JSON object.
- Evaluate only explicit requirements from the input, userCheckFocus, currentCandidatePrompt, and originalPrompt.
- When aOutputStats is present, use it for length, word-count, line-count, paragraph-count, and chapter-count checks instead of estimating these counts yourself.
- If the A output fails, optimize the prompt rather than generating the business answer yourself.
- The next prompt must be complete. Never use "same as above", "unchanged", or partial diffs.
- Only use previousFailureSummary from the immediate previous iteration. Do not infer or include full history.

Required JSON fields:
passed, score, confidence, assumptions, failedItems, passedItems, analysis,
changeSummary, nextFailureSummary, optimizedPrompt, warnings.

optimizedPrompt must always include full systemPrompt and full userPrompt.`;

const B_OPTIMIZER_RESULT_FIELDS = [
  "passed",
  "score",
  "confidence",
  "assumptions",
  "failedItems",
  "passedItems",
  "analysis",
  "changeSummary",
  "nextFailureSummary",
  "optimizedPrompt",
  "warnings",
] as const;

export const B_OPTIMIZER_JSON_REPAIR_WARNING =
  "B optimizer JSON was repaired after a malformed response.";
export const B_OPTIMIZER_LOCAL_JSON_REPAIR_WARNING =
  "B optimizer JSON was repaired locally after a malformed response.";

export class BOptimizerJsonFormatError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "BOptimizerJsonFormatError";
  }
}

export interface PromptOptimizationOutputChapterStats {
  heading: string;
  estimatedWordCount: number;
  cjkCharacters: number;
  latinWords: number;
  totalCharacters: number;
}

export interface PromptOptimizationOutputStats {
  totalCharacters: number;
  cjkCharacters: number;
  latinWords: number;
  estimatedWordCount: number;
  lineCount: number;
  paragraphCount: number;
  chapterCount: number;
  chapters: PromptOptimizationOutputChapterStats[];
}

export function createPromptOptimizationId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function toOptimizationModelSnapshot(
  model: AIModelConfig,
): PromptOptimizationModelSnapshot {
  return {
    id: model.id,
    name: model.name,
    provider: model.provider,
    model: model.model,
    apiUrl: model.apiUrl,
  };
}

export function buildPromptOptimizationPromptSnapshot(
  prompt: Prompt,
): PromptOptimizationSession["promptSnapshot"] {
  return {
    title: prompt.title,
    description: prompt.description ?? null,
    systemPrompt: prompt.systemPrompt ?? null,
    userPrompt: prompt.userPrompt,
    promptVersion: prompt.currentVersion ?? prompt.version,
  };
}

export function createPromptOptimizationSession(input: {
  prompt: Prompt;
  aModel: AIModelConfig;
  bModel: AIModelConfig;
  optimizerTemplate: {
    id?: string;
    title: string;
    sourcePromptId?: string;
    strategyPrompt: string;
  };
  userCheckFocus: string;
  explicitRequirements?: string[];
  now?: string;
}): PromptOptimizationSession {
  const now = input.now ?? new Date().toISOString();
  const initialPrompt: PromptOptimizationPromptContent = {
    systemPrompt: input.prompt.systemPrompt ?? null,
    userPrompt: input.prompt.userPrompt,
  };

  return {
    id: createPromptOptimizationId("opt"),
    promptId: input.prompt.id,
    promptSnapshot: buildPromptOptimizationPromptSnapshot(input.prompt),
    aModel: toOptimizationModelSnapshot(input.aModel),
    bModel: toOptimizationModelSnapshot(input.bModel),
    optimizerTemplate: {
      id: input.optimizerTemplate.id,
      title: input.optimizerTemplate.title,
      sourcePromptId: input.optimizerTemplate.sourcePromptId,
      strategyPrompt: input.optimizerTemplate.strategyPrompt,
    },
    userCheckFocus: input.userCheckFocus.trim(),
    explicitRequirements:
      input.explicitRequirements ??
      extractExplicitRequirements(initialPrompt.systemPrompt, initialPrompt.userPrompt),
    iterations: [],
    currentCandidatePrompt: initialPrompt,
    status: "running",
    autoIterationLimit: MAX_PROMPT_OPTIMIZATION_AUTO_ITERATIONS,
    maxIterations: MAX_PROMPT_OPTIMIZATION_ITERATIONS,
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertPromptOptimizationSession(
  sessions: PromptOptimizationSession[] | undefined,
  nextSession: PromptOptimizationSession,
): PromptOptimizationSession[] {
  const remaining = (sessions ?? []).filter((session) => session.id !== nextSession.id);
  const merged = [nextSession, ...remaining].sort(
    (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
  );
  if (merged.length <= MAX_PROMPT_OPTIMIZATION_SESSIONS) {
    return merged;
  }

  const idsToDrop = new Set(
    [...merged]
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      .slice(0, merged.length - MAX_PROMPT_OPTIMIZATION_SESSIONS)
      .map((session) => session.id),
  );

  return merged.filter((session) => !idsToDrop.has(session.id));
}

export function deletePromptOptimizationSession(
  sessions: PromptOptimizationSession[] | undefined,
  sessionId: string,
): PromptOptimizationSession[] {
  return (sessions ?? []).filter((session) => session.id !== sessionId);
}

export function canContinuePromptOptimizationSession(
  session: PromptOptimizationSession,
): boolean {
  if (session.status === "passed" || session.status === "maxed") {
    return false;
  }
  if (session.iterations.length >= session.maxIterations) {
    return false;
  }

  const latestIteration = session.iterations.at(-1);
  if (latestIteration?.status === "passed" || latestIteration?.bResult?.passed) {
    return false;
  }

  return !hasActivePromptOptimizationIteration(session);
}

export function getPromptOptimizationAutoIterationsRemaining(
  session: PromptOptimizationSession,
): number {
  const autoLimit = Math.min(session.autoIterationLimit, session.maxIterations);
  return Math.max(0, autoLimit - session.iterations.length);
}

export function getLatestPromptOptimizationCandidate(
  session: PromptOptimizationSession,
): PromptOptimizationPromptContent {
  const latestWithResult = [...session.iterations]
    .reverse()
    .find((iteration) => iteration.bResult?.optimizedPrompt);
  return latestWithResult?.bResult?.optimizedPrompt ?? session.currentCandidatePrompt;
}

export function getPreviousFailureSummary(
  session: PromptOptimizationSession,
): PromptOptimizationFailureSummary | null {
  const latest = [...session.iterations].reverse().find((iteration) => iteration.bResult);
  if (!latest || latest.bResult?.passed) {
    return null;
  }

  return latest.bResult?.nextFailureSummary ?? null;
}

export function extractExplicitRequirements(
  systemPrompt: string | null | undefined,
  userPrompt: string,
): string[] {
  const combined = [systemPrompt, userPrompt].filter(Boolean).join("\n");
  const lines = combined
    .split(/\n+/)
    .map((line) => line.replace(/^[-*#\d.)\s]+/, "").trim())
    .filter(Boolean);

  const requirementPattern =
    /(必须|禁止|不要|不得|需要|请|输出|格式|字数|数量|章节|JSON|json|must|should|never|do not|format|length|words|chapters|exactly|at least|no more than)/i;

  const candidates = lines
    .filter((line) => requirementPattern.test(line))
    .map((line) => line.slice(0, 300));

  return Array.from(new Set(candidates)).slice(0, 12);
}

export function buildBOptimizerMessages(input: {
  strategyPrompt: string;
  promptTitle: string;
  promptDescription?: string | null;
  originalPrompt: PromptOptimizationPromptContent;
  currentCandidatePrompt: PromptOptimizationPromptContent;
  aModel: PromptOptimizationModelSnapshot;
  aOutput: string;
  explicitRequirements: string[];
  userCheckFocus: string;
  previousFailureSummary?: PromptOptimizationFailureSummary | null;
  iteration: {
    index: number;
    max: number;
    mode: "auto" | "manual";
  };
}): ChatMessage[] {
  const context = {
    promptTitle: input.promptTitle,
    promptDescription: input.promptDescription ?? "",
    originalPrompt: normalizePromptContent(input.originalPrompt),
    currentCandidatePrompt: normalizePromptContent(input.currentCandidatePrompt),
    aModel: {
      provider: input.aModel.provider,
      model: input.aModel.model,
    },
    aOutput: input.aOutput,
    aOutputStats: analyzePromptOptimizationOutput(input.aOutput),
    explicitRequirements: input.explicitRequirements,
    userCheckFocus: input.userCheckFocus,
    previousFailureSummary: input.previousFailureSummary ?? null,
    iteration: input.iteration,
  };

  return [
    {
      role: "system",
      content: [
        FIXED_B_OPTIMIZER_PROTOCOL,
        "",
        "User-selected optimizer strategy:",
        input.strategyPrompt.trim() || "Use concise, minimal prompt engineering improvements.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(context, null, 2),
    },
  ];
}

export function buildBOptimizerJsonRepairMessages(input: {
  rawContent: string;
}): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a B optimizer JSON format repair agent.",
        "Your only job is to convert one malformed B optimizer response into exactly one valid JSON object.",
        "Do not reevaluate the A output, score, requirements, prompt quality, or optimization strategy.",
        "Do not change the business meaning of any field. Preserve the original values as much as valid JSON allows.",
        "Do not invent missing required fields. If a required field is absent from the raw response, output the closest structurally valid representation of the raw response and let validation fail.",
        "Do not output Markdown, code fences, comments, prose before JSON, or prose after JSON.",
        "Required top-level fields: " + B_OPTIMIZER_RESULT_FIELDS.join(", ") + ".",
        "optimizedPrompt must include full systemPrompt and full userPrompt when those values exist in the raw response.",
      ].join("\n"),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          task: "Repair JSON formatting only.",
          rawBOptimizerOutput: input.rawContent,
        },
        null,
        2,
      ),
    },
  ];
}

export function isBOptimizerJsonFormatError(error: unknown): boolean {
  return error instanceof BOptimizerJsonFormatError || error instanceof SyntaxError;
}

export function repairBOptimizerJsonLocally(rawContent: string): string | null {
  let jsonObject: string;
  try {
    jsonObject = extractJsonObject(rawContent);
  } catch {
    return null;
  }

  const repaired = insertMissingCommasBetweenObjectProperties(
    stripTrailingCommas(quoteUnquotedObjectKeys(normalizeJsonLikeStrings(jsonObject))),
  );
  if (repaired === jsonObject) {
    return null;
  }

  try {
    const parsed = JSON.parse(repaired) as unknown;
    return isRecord(parsed) ? repaired : null;
  } catch {
    return null;
  }
}

export function analyzePromptOptimizationOutput(
  text: string,
): PromptOptimizationOutputStats {
  const totalCharacters = Array.from(text).length;
  const cjkCharacters = countCjkCharacters(text);
  const latinWords = countLatinWords(text);
  const estimatedWordCount = cjkCharacters + latinWords;
  const lineCount = text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
  const paragraphCount =
    text.trim().length === 0 ? 0 : text.trim().split(/(?:\r\n|\r|\n)\s*(?:\r\n|\r|\n)+/).filter(Boolean).length;
  const chapters = analyzeChapterStats(text);

  return {
    totalCharacters,
    cjkCharacters,
    latinWords,
    estimatedWordCount,
    lineCount,
    paragraphCount,
    chapterCount: chapters.length,
    chapters,
  };
}

export function parseBOptimizerResult(rawContent: string): PromptOptimizationResult {
  const parsed = parseBOptimizerJsonObject(rawContent);
  if (!isRecord(parsed)) {
    throw new Error("B optimizer response is not a JSON object");
  }

  const missingFields = B_OPTIMIZER_RESULT_FIELDS.filter((field) => !hasOwn(parsed, field));
  if (missingFields.length > 0) {
    throw new Error(
      `B optimizer response missing required field(s): ${missingFields.join(", ")}`,
    );
  }

  const optimizedPrompt = parseOptimizerPromptContent(parsed.optimizedPrompt);
  const failedItems = parseFailedItems(parsed.failedItems);
  const passedItems = parsePassedItems(parsed.passedItems);
  const assumptions = parseStringArray(parsed.assumptions, "assumptions");
  const warnings = parseStringArray(parsed.warnings, "warnings");
  const nextFailureSummary = parseFailureSummary(parsed.nextFailureSummary, failedItems);
  const score = Number.isFinite(parsed.score) ? Math.round(Number(parsed.score)) : 0;
  const confidence = parseConfidence(parsed.confidence);

  if (typeof parsed.passed !== "boolean") {
    throw new Error("B optimizer response field passed must be boolean");
  }
  if (!Number.isFinite(parsed.score)) {
    throw new Error("B optimizer response field score must be a number");
  }
  if (!confidence) {
    throw new Error("B optimizer response field confidence is invalid");
  }
  if (typeof parsed.analysis !== "string") {
    throw new Error("B optimizer response field analysis must be string");
  }
  if (typeof parsed.changeSummary !== "string") {
    throw new Error("B optimizer response field changeSummary must be string");
  }

  return {
    passed: parsed.passed,
    score: Math.max(0, Math.min(100, score)),
    confidence,
    assumptions,
    failedItems,
    passedItems,
    analysis: parsed.analysis,
    changeSummary: parsed.changeSummary,
    nextFailureSummary,
    optimizedPrompt,
    warnings,
  };
}

export function normalizePromptOptimizationSession(
  session: PromptOptimizationSession,
  updates: Partial<PromptOptimizationSession>,
): PromptOptimizationSession {
  const now = updates.updatedAt ?? new Date().toISOString();
  return {
    ...session,
    ...updates,
    updatedAt: now,
  };
}

function normalizePromptContent(
  value: Partial<PromptOptimizationPromptContent> | undefined,
): PromptOptimizationPromptContent {
  return {
    systemPrompt:
      typeof value?.systemPrompt === "string"
        ? value.systemPrompt
        : value?.systemPrompt === null
          ? null
          : "",
    userPrompt: typeof value?.userPrompt === "string" ? value.userPrompt : "",
  };
}

function hasActivePromptOptimizationIteration(
  session: PromptOptimizationSession,
): boolean {
  const latestIteration = session.iterations.at(-1);
  return (
    latestIteration !== undefined &&
    latestIteration.completedAt === undefined &&
    (latestIteration.status === "generating" || latestIteration.status === "checking")
  );
}

function normalizeFailureSummary(
  value: Partial<PromptOptimizationFailureSummary> | undefined,
): PromptOptimizationFailureSummary {
  return {
    unmetItems: toStringArray(value?.unmetItems).slice(0, 3),
    cause: String(value?.cause ?? ""),
    avoidRepeatAdvice: String(value?.avoidRepeatAdvice ?? ""),
  };
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function parseOptimizerPromptContent(value: unknown): PromptOptimizationPromptContent {
  if (!isRecord(value)) {
    throw new Error("B optimizer response field optimizedPrompt must be an object");
  }
  if (!hasOwn(value, "systemPrompt") || !hasOwn(value, "userPrompt")) {
    throw new Error("B optimizer response field optimizedPrompt must include full systemPrompt and userPrompt");
  }
  if (value.systemPrompt !== null && typeof value.systemPrompt !== "string") {
    throw new Error("B optimizer response field optimizedPrompt.systemPrompt must be string or null");
  }
  if (typeof value.userPrompt !== "string" || value.userPrompt.trim().length === 0) {
    throw new Error("B optimizer response field optimizedPrompt.userPrompt must be a non-empty string");
  }

  return normalizePromptContent({
    systemPrompt: value.systemPrompt,
    userPrompt: value.userPrompt,
  } satisfies PromptOptimizationPromptContent);
}

function parseFailureSummary(
  value: unknown,
  failedItems: PromptOptimizationResult["failedItems"],
): PromptOptimizationFailureSummary {
  if (typeof value === "string") {
    return {
      unmetItems: failedItems.map((item) => item.requirement).filter(Boolean).slice(0, 3),
      cause: value,
      avoidRepeatAdvice:
        "Update the next candidate prompt to directly address these unmet items and avoid repeating this failure.",
    };
  }

  if (!isRecord(value)) {
    throw new Error("B optimizer response field nextFailureSummary must be an object");
  }
  if (!Array.isArray(value.unmetItems)) {
    throw new Error("B optimizer response field nextFailureSummary.unmetItems must be an array");
  }

  return {
    unmetItems: toStringArray(value.unmetItems).slice(0, 3),
    cause: typeof value.cause === "string" ? value.cause : "",
    avoidRepeatAdvice:
      typeof value.avoidRepeatAdvice === "string" ? value.avoidRepeatAdvice : "",
  };
}

function parseFailedItems(value: unknown): PromptOptimizationResult["failedItems"] {
  if (!Array.isArray(value)) {
    throw new Error("B optimizer response field failedItems must be an array");
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      return {
        requirement: item,
        actual: "",
        severity: "medium",
      };
    }

    if (!isRecord(item)) {
      throw new Error(
        `B optimizer response failedItems[${index}] must be an object or string`,
      );
    }

    return {
      requirement: String(item.requirement ?? ""),
      actual: String(item.actual ?? ""),
      severity:
        item.severity === "low" || item.severity === "medium" || item.severity === "high"
          ? item.severity
          : "medium",
      evidence: item.evidence === undefined ? undefined : String(item.evidence),
    };
  });
}

function parsePassedItems(value: unknown): PromptOptimizationResult["passedItems"] {
  if (!Array.isArray(value)) {
    throw new Error("B optimizer response field passedItems must be an array");
  }

  return value.map((item, index) => {
    if (typeof item === "string") {
      return {
        requirement: item,
      };
    }

    if (!isRecord(item)) {
      throw new Error(
        `B optimizer response passedItems[${index}] must be an object or string`,
      );
    }

    return {
      requirement: String(item.requirement ?? ""),
      evidence: item.evidence === undefined ? undefined : String(item.evidence),
    };
  });
}

function parseStringArray(value: unknown, fieldName: string): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`B optimizer response field ${fieldName} must be an array`);
  }
  return toStringArray(value);
}

function parseConfidence(value: unknown): PromptOptimizationResult["confidence"] | null {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value >= 0.8) return "high";
    if (value >= 0.5) return "medium";
    return "low";
  }
  return null;
}

function countCjkCharacters(text: string): number {
  return Array.from(text).filter((char) => /\p{Script=Han}/u.test(char)).length;
}

function countLatinWords(text: string): number {
  return text.match(/[A-Za-z]+(?:['-][A-Za-z]+)*/g)?.length ?? 0;
}

function analyzeChapterStats(text: string): PromptOptimizationOutputChapterStats[] {
  const chapterMatches = Array.from(
    text.matchAll(/^#{0,6}\s*(第[零〇一二三四五六七八九十百千万\d]+章[^\r\n]*)/gm),
  );
  return chapterMatches.map((match, index) => {
    const start = match.index ?? 0;
    const end = chapterMatches[index + 1]?.index ?? text.length;
    const chapterText = text.slice(start, end).trim();
    const cjkCharacters = countCjkCharacters(chapterText);
    const latinWords = countLatinWords(chapterText);

    return {
      heading: match[1].trim(),
      estimatedWordCount: cjkCharacters + latinWords,
      cjkCharacters,
      latinWords,
      totalCharacters: Array.from(chapterText).length,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, field);
}

function normalizeJsonLikeStrings(value: string): string {
  let repaired = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") {
      const result = readDoubleQuotedJsonLikeString(value, index);
      repaired += result.output;
      index = result.endIndex;
      continue;
    }
    if (char === "'") {
      const result = readSingleQuotedJsonLikeString(value, index);
      repaired += result.output;
      index = result.endIndex;
      continue;
    }
    repaired += char;
  }
  return repaired;
}

function readDoubleQuotedJsonLikeString(
  value: string,
  startIndex: number,
): { output: string; endIndex: number } {
  let output = "\"";
  for (let index = startIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      const next = value[index + 1];
      if (next === undefined) {
        output += "\\\\";
        return { output: `${output}"`, endIndex: index };
      }
      output += char + next;
      index += 1;
      continue;
    }
    if (char === "\"") {
      return { output: `${output}"`, endIndex: index };
    }
    const escapedControlChar = escapeJsonControlCharacter(char);
    if (escapedControlChar) {
      output += escapedControlChar;
      continue;
    }
    output += char;
  }
  return { output: `${output}"`, endIndex: value.length - 1 };
}

function readSingleQuotedJsonLikeString(
  value: string,
  startIndex: number,
): { output: string; endIndex: number } {
  let content = "";
  for (let index = startIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      const next = value[index + 1];
      if (next === undefined) {
        content += "\\";
        return { output: JSON.stringify(content), endIndex: index };
      }
      content += decodeJsonLikeEscape(next);
      index += 1;
      continue;
    }
    if (char === "'") {
      return { output: JSON.stringify(content), endIndex: index };
    }
    content += char;
  }
  return { output: JSON.stringify(content), endIndex: value.length - 1 };
}

function decodeJsonLikeEscape(char: string): string {
  if (char === "n") return "\n";
  if (char === "r") return "\r";
  if (char === "t") return "\t";
  if (char === "b") return "\b";
  if (char === "f") return "\f";
  return char;
}

function escapeJsonControlCharacter(char: string): string | null {
  if (char === "\n") return "\\n";
  if (char === "\r") return "\\r";
  if (char === "\t") return "\\t";
  if (char === "\b") return "\\b";
  if (char === "\f") return "\\f";
  if (char.charCodeAt(0) < 0x20) {
    return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
  }
  return null;
}

function quoteUnquotedObjectKeys(value: string): string {
  let repaired = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") {
      const endIndex = findJsonStringEnd(value, index);
      repaired += value.slice(index, endIndex + 1);
      index = endIndex;
      continue;
    }

    const previousSignificant = findPreviousSignificantChar(value, index);
    if (
      (previousSignificant === "{" || previousSignificant === ",") &&
      isIdentifierStart(char)
    ) {
      const endIndex = readIdentifierEnd(value, index);
      const nextSignificantIndex = skipWhitespace(value, endIndex);
      if (value[nextSignificantIndex] === ":") {
        repaired += JSON.stringify(value.slice(index, endIndex));
        index = endIndex - 1;
        continue;
      }
    }

    repaired += char;
  }
  return repaired;
}

function stripTrailingCommas(value: string): string {
  let repaired = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") {
      const endIndex = findJsonStringEnd(value, index);
      repaired += value.slice(index, endIndex + 1);
      index = endIndex;
      continue;
    }
    if (char === ",") {
      const nextSignificantIndex = skipWhitespace(value, index + 1);
      const nextSignificant = value[nextSignificantIndex];
      if (nextSignificant === "}" || nextSignificant === "]") {
        continue;
      }
    }
    repaired += char;
  }
  return repaired;
}

function insertMissingCommasBetweenObjectProperties(value: string): string {
  let repaired = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\"") {
      const endIndex = findJsonStringEnd(value, index);
      const nextSignificantIndex = skipWhitespace(value, endIndex + 1);
      const previousSignificant = findPreviousSignificantChar(repaired, repaired.length);
      if (
        value[nextSignificantIndex] === ":" &&
        previousSignificant !== undefined &&
        previousSignificant !== "{" &&
        previousSignificant !== "[" &&
        previousSignificant !== "," &&
        previousSignificant !== ":"
      ) {
        repaired += ",";
      }
      repaired += value.slice(index, endIndex + 1);
      index = endIndex;
      continue;
    }
    repaired += char;
  }
  return repaired;
}

function findJsonStringEnd(value: string, startIndex: number): number {
  for (let index = startIndex + 1; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "\"") {
      return index;
    }
  }
  return value.length - 1;
}

function findPreviousSignificantChar(value: string, beforeIndex: number): string | undefined {
  for (let index = beforeIndex - 1; index >= 0; index -= 1) {
    const char = value[index];
    if (!/\s/.test(char)) {
      return char;
    }
  }
  return undefined;
}

function skipWhitespace(value: string, startIndex: number): number {
  let index = startIndex;
  while (index < value.length && /\s/.test(value[index])) {
    index += 1;
  }
  return index;
}

function isIdentifierStart(char: string | undefined): boolean {
  return char !== undefined && /[A-Za-z_$]/.test(char);
}

function readIdentifierEnd(value: string, startIndex: number): number {
  let index = startIndex + 1;
  while (index < value.length && /[A-Za-z0-9_$-]/.test(value[index])) {
    index += 1;
  }
  return index;
}

function parseBOptimizerJsonObject(rawContent: string): unknown {
  const jsonObject = extractJsonObject(rawContent);
  try {
    return JSON.parse(jsonObject) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new BOptimizerJsonFormatError(
        `B optimizer response contains malformed JSON: ${error.message}`,
        { cause: error },
      );
    }
    throw error;
  }
}

function extractJsonObject(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new BOptimizerJsonFormatError(
      "B optimizer response does not contain an extractable JSON object",
    );
  }

  return trimmed.slice(start, end + 1);
}
