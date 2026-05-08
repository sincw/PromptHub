import { describe, expect, it, vi } from "vitest";
import type { Prompt, PromptOptimizationSession } from "@prompthub/shared";
import {
  analyzePromptOptimizationOutput,
  B_OPTIMIZER_LOCAL_JSON_REPAIR_WARNING,
  B_OPTIMIZER_JSON_REPAIR_WARNING,
  buildBOptimizerJsonRepairMessages,
  buildBOptimizerMessages,
  canContinuePromptOptimizationSession,
  createPromptOptimizationSession,
  extractExplicitRequirements,
  getPreviousFailureSummary,
  getPromptOptimizationAutoIterationsRemaining,
  isBOptimizerJsonFormatError,
  parseBOptimizerResult,
  repairBOptimizerJsonLocally,
  upsertPromptOptimizationSession,
} from "../../vendor/renderer/services/prompt-optimization";
import type { AIModelConfig } from "../../vendor/renderer/stores/settings.store";

vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid",
});

const prompt: Prompt = {
  id: "prompt-1",
  title: "Novel Prompt",
  description: "Test prompt",
  promptType: "text",
  systemPrompt: "你必须严格遵守用户格式。",
  userPrompt: "请输出 10 章。禁止出现广告。每章约 1000 字。",
  variables: [],
  tags: [],
  isFavorite: false,
  isPinned: false,
  version: 1,
  currentVersion: 1,
  usageCount: 0,
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z",
};

const model: AIModelConfig = {
  id: "model-1",
  type: "chat",
  provider: "openai",
  apiKey: "key",
  apiUrl: "https://example.test",
  model: "gpt-test",
};

describe("prompt optimization utilities", () => {
  it("creates immutable session snapshots and extracts explicit requirements", () => {
    const session = createPromptOptimizationSession({
      prompt,
      aModel: model,
      bModel: { ...model, id: "model-2", model: "gpt-b" },
      optimizerTemplate: {
        title: "Darwin",
        strategyPrompt: "Score and optimize.",
      },
      userCheckFocus: "章节数量必须满足",
      now: "2026-05-02T00:00:00.000Z",
    });

    expect(session.promptSnapshot.userPrompt).toBe(prompt.userPrompt);
    expect(session.bModel.model).toBe("gpt-b");
    expect(session.userCheckFocus).toBe("章节数量必须满足");
    expect(session.explicitRequirements).toEqual(
      expect.arrayContaining(["请输出 10 章。禁止出现广告。每章约 1000 字。"]),
    );
    expect(session.iterations).toHaveLength(0);
  });

  it("keeps only 20 newest sessions when upserting", () => {
    const sessions = Array.from({ length: 20 }, (_, index) =>
      makeSession(`old-${index}`, `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
    );
    const next = makeSession("newest", "2026-06-01T00:00:00.000Z");

    const result = upsertPromptOptimizationSession(sessions, next);

    expect(result).toHaveLength(20);
    expect(result[0].id).toBe("newest");
    expect(result.some((session) => session.id === "old-0")).toBe(false);
  });

  it("trims the oldest created session instead of the least recently updated session", () => {
    const resumedOldest = makeSession("resumed-oldest", "2026-07-01T00:00:00.000Z");
    resumedOldest.createdAt = "2026-01-01T00:00:00.000Z";
    const sessions = [
      resumedOldest,
      ...Array.from({ length: 19 }, (_, index) =>
        makeSession(
          `created-${index}`,
          `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
        ),
      ),
    ];
    const next = makeSession("new-session", "2026-06-01T00:00:00.000Z");

    const result = upsertPromptOptimizationSession(sessions, next);

    expect(result).toHaveLength(20);
    expect(result.some((session) => session.id === "resumed-oldest")).toBe(false);
    expect(result.some((session) => session.id === "created-0")).toBe(true);
  });

  it("builds B optimizer messages with deterministic A output stats and only previousFailureSummary as history", () => {
    const messages = buildBOptimizerMessages({
      strategyPrompt: "Use strict checks.",
      promptTitle: "Prompt",
      originalPrompt: { systemPrompt: "", userPrompt: "Original" },
      currentCandidatePrompt: { systemPrompt: "", userPrompt: "Candidate" },
      aModel: { provider: "openai", model: "gpt-a" },
      aOutput: "第1章：开端\n这是第一章。\n\n第2章：转折\nThis chapter has two words.",
      explicitRequirements: ["输出 10 章"],
      userCheckFocus: "章节数量",
      previousFailureSummary: {
        unmetItems: ["章节数不足"],
        cause: "数量要求不够显式",
        avoidRepeatAdvice: "要求先列 10 章标题",
      },
      iteration: { index: 2, max: 10, mode: "manual" },
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain("Do not ask follow-up questions");
    expect(messages[0].content).toContain("use it for length");
    expect(messages[1].content).toContain('"previousFailureSummary"');
    expect(messages[1].content).not.toContain("fullHistory");

    const context = JSON.parse(messages[1].content);
    expect(context.aOutputStats).toMatchObject({
      totalCharacters: 49,
      cjkCharacters: 13,
      latinWords: 5,
      estimatedWordCount: 18,
      lineCount: 5,
      paragraphCount: 2,
      chapterCount: 2,
    });
    expect(context.aOutputStats.chapters).toEqual([
      expect.objectContaining({
        heading: "第1章：开端",
        estimatedWordCount: 9,
      }),
      expect.objectContaining({
        heading: "第2章：转折",
        estimatedWordCount: 9,
      }),
    ]);
  });

  it("builds focused B optimizer JSON repair messages without evaluation context", () => {
    const rawContent = '{"passed": false "score": 60, "optimizedPrompt": {"userPrompt": "U"}}';
    const messages = buildBOptimizerJsonRepairMessages({ rawContent });

    expect(messages).toHaveLength(2);
    expect(messages[0].content).toContain("only job");
    expect(messages[0].content).toContain("Do not reevaluate");
    expect(messages[0].content).toContain("Do not change the business meaning");
    expect(messages[0].content).toContain("Required top-level fields");
    expect(messages[0].content).toContain("optimizedPrompt");
    expect(messages[0].content).toContain("warnings");
    expect(messages[0].content).not.toContain("User-selected optimizer strategy");

    const repairInput = JSON.parse(messages[1].content);
    expect(repairInput).toEqual({
      task: "Repair JSON formatting only.",
      rawBOptimizerOutput: rawContent,
    });
    expect(messages[1].content).not.toContain("aOutputStats");
    expect(messages[1].content).not.toContain("currentCandidatePrompt");
  });

  it("classifies only malformed B optimizer JSON parse failures as repairable", () => {
    let malformedError: unknown;
    try {
      parseBOptimizerResult('{"passed": false "score": 60}');
    } catch (error) {
      malformedError = error;
    }
    expect(isBOptimizerJsonFormatError(malformedError)).toBe(true);

    let extractionError: unknown;
    try {
      parseBOptimizerResult("B returned prose without a JSON object");
    } catch (error) {
      extractionError = error;
    }
    expect(isBOptimizerJsonFormatError(extractionError)).toBe(true);

    let semanticError: unknown;
    try {
      parseBOptimizerResult(
        JSON.stringify({
          passed: false,
          score: 70,
          confidence: "medium",
          assumptions: [],
          failedItems: [],
          passedItems: [],
          analysis: "Missing optimized prompt",
          changeSummary: "No candidate returned",
          nextFailureSummary: {
            unmetItems: [],
            cause: "",
            avoidRepeatAdvice: "",
          },
          warnings: [],
        }),
      );
    } catch (error) {
      semanticError = error;
    }
    expect(isBOptimizerJsonFormatError(semanticError)).toBe(false);
    expect(B_OPTIMIZER_JSON_REPAIR_WARNING).toBe(
      "B optimizer JSON was repaired after a malformed response.",
    );
  });

  it("repairs common B optimizer JSON formatting locally before model fallback", () => {
    const malformed = JSON.stringify(createBOptimizerPayload())
      .replace('"passed":false,', '"passed": false ')
      .replace('"warnings":[]}', '"warnings":[],}');

    const repaired = repairBOptimizerJsonLocally(`\`\`\`json\n${malformed}\n\`\`\``);

    expect(repaired).toEqual(expect.any(String));
    const result = parseBOptimizerResult(repaired ?? "");
    expect(result.score).toBe(60);
    expect(result.optimizedPrompt.userPrompt).toBe("Better prompt");
    expect(B_OPTIMIZER_LOCAL_JSON_REPAIR_WARNING).toBe(
      "B optimizer JSON was repaired locally after a malformed response.",
    );
  });

  it("repairs unquoted keys and single quoted strings locally", () => {
    const repaired = repairBOptimizerJsonLocally(
      "{passed: false, score: 60, confidence: 'medium', assumptions: [], failedItems: [], passedItems: [], analysis: 'Needs work', changeSummary: 'Tighten output', nextFailureSummary: {unmetItems: ['word count'], cause: 'too short', avoidRepeatAdvice: 'make length explicit'}, optimizedPrompt: {systemPrompt: null, userPrompt: 'Better prompt'}, warnings: []}",
    );

    expect(repaired).toEqual(expect.any(String));
    const result = parseBOptimizerResult(repaired ?? "");
    expect(result.analysis).toBe("Needs work");
    expect(result.nextFailureSummary.unmetItems).toEqual(["word count"]);
  });

  it("does not make semantically incomplete B optimizer JSON valid during local repair", () => {
    const repaired = repairBOptimizerJsonLocally('{"passed": false "score": 60}');

    expect(repaired).toEqual(expect.any(String));
    expect(() => parseBOptimizerResult(repaired ?? "")).toThrow(
      /missing required field/,
    );
  });

  it("analyzes A output text statistics deterministically", () => {
    expect(analyzePromptOptimizationOutput("第1章\n中文 text.\n\n第2章\nmore words")).toMatchObject({
      cjkCharacters: 6,
      latinWords: 3,
      estimatedWordCount: 9,
      lineCount: 5,
      paragraphCount: 2,
      chapterCount: 2,
      chapters: [
        expect.objectContaining({ heading: "第1章", estimatedWordCount: 5 }),
        expect.objectContaining({ heading: "第2章", estimatedWordCount: 4 }),
      ],
    });
  });

  it("parses and normalizes B optimizer JSON", () => {
    const result = parseBOptimizerResult(
      JSON.stringify({
        passed: false,
        score: 72.4,
        confidence: "high",
        assumptions: [],
        failedItems: [{ requirement: "10 章", actual: "7 章", severity: "high" }],
        passedItems: [{ requirement: "中文" }],
        analysis: "章节不足",
        changeSummary: "强化章节数量约束",
        nextFailureSummary: {
          unmetItems: ["章节不足", "缺少自检", "格式不稳定", "ignored"],
          cause: "格式要求弱",
          avoidRepeatAdvice: "增加自检",
        },
        optimizedPrompt: { systemPrompt: "S", userPrompt: "U" },
        warnings: [],
      }),
    );

    expect(result.score).toBe(72);
    expect(result.optimizedPrompt.userPrompt).toBe("U");
    expect(result.nextFailureSummary.unmetItems).toHaveLength(3);
  });

  it("normalizes string failedItems and passedItems from B optimizer JSON", () => {
    const result = parseBOptimizerResult(
      JSON.stringify({
        passed: false,
        score: 68,
        confidence: "medium",
        assumptions: [],
        failedItems: ["章节数量不足", "缺少结尾自检"],
        passedItems: ["使用中文输出", "没有出现广告"],
        analysis: "主要失败在结构数量。",
        changeSummary: "增加章节数量和自检要求。",
        nextFailureSummary: {
          unmetItems: ["章节数量不足"],
          cause: "数量约束不够显式",
          avoidRepeatAdvice: "要求输出前先列 10 个章节标题",
        },
        optimizedPrompt: { systemPrompt: null, userPrompt: "请输出完整 10 章，并在结尾自检。" },
        warnings: [],
      }),
    );

    expect(result.failedItems).toEqual([
      { requirement: "章节数量不足", actual: "", severity: "medium" },
      { requirement: "缺少结尾自检", actual: "", severity: "medium" },
    ]);
    expect(result.passedItems).toEqual([
      { requirement: "使用中文输出" },
      { requirement: "没有出现广告" },
    ]);
  });

  it("normalizes real-model B optimizer scalar variants", () => {
    const result = parseBOptimizerResult(
      JSON.stringify({
        passed: false,
        score: 64,
        confidence: 0.9,
        assumptions: "A 输出被视为完整响应文本。",
        failedItems: ["字数不足", "章节数量不足", "缺少结尾自检", "额外失败项"],
        passedItems: ["使用中文输出"],
        analysis: "输出长度和结构未达标。",
        changeSummary: "强化字数、章节数量和自检要求。",
        nextFailureSummary: "A 输出明显短于要求，且章节数量不足。",
        optimizedPrompt: {
          systemPrompt: "S",
          userPrompt: "请完整输出 10 章，每章约 1000 字，并在结尾自检。",
        },
        warnings: "B 根据确定性统计判断长度不足。",
      }),
    );

    expect(result.confidence).toBe("high");
    expect(result.assumptions).toEqual(["A 输出被视为完整响应文本。"]);
    expect(result.warnings).toEqual(["B 根据确定性统计判断长度不足。"]);
    expect(result.failedItems).toEqual([
      { requirement: "字数不足", actual: "", severity: "medium" },
      { requirement: "章节数量不足", actual: "", severity: "medium" },
      { requirement: "缺少结尾自检", actual: "", severity: "medium" },
      { requirement: "额外失败项", actual: "", severity: "medium" },
    ]);
    expect(result.nextFailureSummary).toEqual({
      unmetItems: ["字数不足", "章节数量不足", "缺少结尾自检"],
      cause: "A 输出明显短于要求，且章节数量不足。",
      avoidRepeatAdvice:
        "Update the next candidate prompt to directly address these unmet items and avoid repeating this failure.",
    });
  });

  it("rejects incomplete B optimizer JSON instead of falling back silently", () => {
    expect(() =>
      parseBOptimizerResult(
        JSON.stringify({
          passed: false,
          score: 70,
          confidence: "medium",
          assumptions: [],
          failedItems: [],
          passedItems: [],
          analysis: "Missing optimized prompt",
          changeSummary: "No candidate returned",
          nextFailureSummary: {
            unmetItems: [],
            cause: "",
            avoidRepeatAdvice: "",
          },
          warnings: [],
        }),
      ),
    ).toThrow(/missing required field.*optimizedPrompt/);
  });

  it("allows resuming stopped sessions under the total iteration cap only", () => {
    expect(canContinuePromptOptimizationSession(makeSession("stopped", "2026-05-01T00:00:00.000Z"))).toBe(true);

    const passed = makeSession("passed", "2026-05-01T00:00:00.000Z");
    passed.status = "passed";
    expect(canContinuePromptOptimizationSession(passed)).toBe(false);

    const maxed = makeSession("maxed", "2026-05-01T00:00:00.000Z");
    maxed.iterations = Array.from({ length: 10 }, (_, index) => ({
      id: `iter-${index}`,
      index: index + 1,
      mode: "manual",
      candidatePrompt: { systemPrompt: "", userPrompt: "Prompt" },
      aModel: { provider: "openai", model: "a" },
      bModel: { provider: "openai", model: "b" },
      status: "optimized",
      startedAt: "2026-05-01T00:00:00.000Z",
    }));
    expect(canContinuePromptOptimizationSession(maxed)).toBe(false);
  });

  it("allows recovering a persisted running session after a completed non-passed optimized round", () => {
    const session = makeSession("recoverable-running", "2026-05-01T00:00:00.000Z");
    session.status = "running";
    session.iterations = [
      makeOptimizedIteration(1, {
        passed: false,
        optimizedPrompt: { systemPrompt: "", userPrompt: "Better Prompt" },
      }),
    ];
    session.currentCandidatePrompt = { systemPrompt: "", userPrompt: "Better Prompt" };

    expect(canContinuePromptOptimizationSession(session)).toBe(true);
  });

  it("does not continue a running session while the latest iteration is still active", () => {
    const session = makeSession("active-running", "2026-05-01T00:00:00.000Z");
    session.status = "running";
    session.iterations = [
      {
        id: "iter-active",
        index: 1,
        mode: "auto",
        candidatePrompt: { systemPrompt: "", userPrompt: "Prompt" },
        aModel: { provider: "openai", model: "a" },
        bModel: { provider: "openai", model: "b" },
        status: "generating",
        startedAt: "2026-05-01T00:00:00.000Z",
      },
    ];

    expect(canContinuePromptOptimizationSession(session)).toBe(false);
  });

  it("uses the latest B failure summary when the newest retry has no B result", () => {
    const session = makeSession("stopped-after-abort", "2026-05-01T00:00:00.000Z");
    session.iterations = [
      makeOptimizedIteration(1, { passed: false }),
      {
        id: "iter-aborted",
        index: 2,
        mode: "manual",
        candidatePrompt: { systemPrompt: "", userPrompt: "Better Prompt" },
        previousFailureSummary: {
          unmetItems: ["Need more detail"],
          cause: "Prompt was underspecified",
          avoidRepeatAdvice: "Ask for concrete detail",
        },
        aModel: { provider: "openai", model: "a" },
        bModel: { provider: "openai", model: "b" },
        status: "error",
        error: "Stopped by user",
        startedAt: "2026-05-01T00:01:00.000Z",
        completedAt: "2026-05-01T00:02:00.000Z",
      },
    ];

    expect(getPreviousFailureSummary(session)).toEqual({
      unmetItems: ["Need more detail"],
      cause: "Prompt was underspecified",
      avoidRepeatAdvice: "Ask for concrete detail",
    });
  });

  it("computes remaining automatic iteration capacity from the session auto limit", () => {
    const session = makeSession("auto-capacity", "2026-05-01T00:00:00.000Z");
    expect(getPromptOptimizationAutoIterationsRemaining(session)).toBe(3);

    session.iterations = [
      makeOptimizedIteration(1, { passed: false }),
      makeOptimizedIteration(2, { passed: false }),
    ];
    expect(getPromptOptimizationAutoIterationsRemaining(session)).toBe(1);

    session.iterations = [
      ...session.iterations,
      makeOptimizedIteration(3, { passed: false }),
    ];
    expect(getPromptOptimizationAutoIterationsRemaining(session)).toBe(0);
  });

  it("extracts explicit requirement-like lines conservatively", () => {
    expect(extractExplicitRequirements(null, "背景说明\n必须输出 JSON\n不要出现英文")).toEqual([
      "必须输出 JSON",
      "不要出现英文",
    ]);
  });
});

function makeSession(id: string, updatedAt: string): PromptOptimizationSession {
  return {
    id,
    promptId: "prompt-1",
    promptSnapshot: {
      title: "Prompt",
      systemPrompt: "",
      userPrompt: "Prompt",
      promptVersion: 1,
    },
    aModel: { provider: "openai", model: "a" },
    bModel: { provider: "openai", model: "b" },
    optimizerTemplate: { title: "Template", strategyPrompt: "Strategy" },
    userCheckFocus: "",
    explicitRequirements: [],
    iterations: [],
    currentCandidatePrompt: { systemPrompt: "", userPrompt: "Prompt" },
    status: "stopped",
    autoIterationLimit: 3,
    maxIterations: 10,
    createdAt: updatedAt,
    updatedAt,
  };
}

function createBOptimizerPayload() {
  return {
    passed: false,
    score: 60,
    confidence: "medium",
    assumptions: [],
    failedItems: [],
    passedItems: [],
    analysis: "Needs work",
    changeSummary: "Tighten output",
    nextFailureSummary: {
      unmetItems: ["word count"],
      cause: "too short",
      avoidRepeatAdvice: "make length explicit",
    },
    optimizedPrompt: {
      systemPrompt: null,
      userPrompt: "Better prompt",
    },
    warnings: [],
  };
}

function makeOptimizedIteration(
  index: number,
  overrides: {
    passed: boolean;
    optimizedPrompt?: { systemPrompt: string | null; userPrompt: string };
  },
): PromptOptimizationSession["iterations"][number] {
  const optimizedPrompt = overrides.optimizedPrompt ?? { systemPrompt: "", userPrompt: "Prompt" };
  return {
    id: `iter-${index}`,
    index,
    mode: "auto",
    candidatePrompt: { systemPrompt: "", userPrompt: "Prompt" },
    aModel: { provider: "openai", model: "a" },
    bModel: { provider: "openai", model: "b" },
    aOutput: "A output",
    bResult: {
      passed: overrides.passed,
      score: overrides.passed ? 95 : 60,
      confidence: "medium",
      assumptions: [],
      failedItems: overrides.passed
        ? []
        : [{ requirement: "Need more detail", actual: "Too short", severity: "medium" }],
      passedItems: overrides.passed ? [{ requirement: "Meets requirements" }] : [],
      analysis: overrides.passed ? "Meets requirements" : "Needs another round",
      changeSummary: overrides.passed ? "No change needed" : "Added stricter details",
      nextFailureSummary: {
        unmetItems: overrides.passed ? [] : ["Need more detail"],
        cause: overrides.passed ? "" : "Prompt was underspecified",
        avoidRepeatAdvice: overrides.passed ? "" : "Ask for concrete detail",
      },
      optimizedPrompt,
      warnings: [],
    },
    status: overrides.passed ? "passed" : "optimized",
    startedAt: "2026-05-01T00:00:00.000Z",
    completedAt: "2026-05-01T00:00:01.000Z",
  };
}
