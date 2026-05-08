import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckIcon,
  CopyIcon,
  GitCompareIcon,
  HistoryIcon,
  LoaderIcon,
  Maximize2Icon,
  MinusIcon,
  PanelRightOpenIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import type {
  Prompt,
  PromptOptimizationIteration,
  PromptOptimizationPromptContent,
  PromptOptimizationSession,
  UpdatePromptDTO,
} from "@prompthub/shared/types";
import { useSettingsStore, type AIModelConfig } from "../../stores/settings.store";
import { usePromptStore } from "../../stores/prompt.store";
import { resolveScenarioModel, isConfiguredModel } from "../../services/ai-defaults";
import {
  buildMessagesFromPrompt,
  chatCompletion,
  type AIConfig,
  type ChatCompletionResult,
} from "../../services/ai";
import {
  B_OPTIMIZER_LOCAL_JSON_REPAIR_WARNING,
  B_OPTIMIZER_JSON_REPAIR_WARNING,
  buildBOptimizerJsonRepairMessages,
  buildBOptimizerMessages,
  canContinuePromptOptimizationSession,
  createPromptOptimizationId,
  createPromptOptimizationSession,
  deletePromptOptimizationSession,
  extractExplicitRequirements,
  getLatestPromptOptimizationCandidate,
  getPreviousFailureSummary,
  getPromptOptimizationAutoIterationsRemaining,
  isBOptimizerJsonFormatError,
  MAX_PROMPT_OPTIMIZATION_ITERATIONS,
  parseBOptimizerResult,
  repairBOptimizerJsonLocally,
  upsertPromptOptimizationSession,
} from "../../services/prompt-optimization";
import { Modal } from "../ui/Modal";
import { useToast } from "../ui/Toast";

interface PromptOptimizationWorkspaceProps {
  prompt: Prompt;
  allPrompts: Prompt[];
  updatePrompt: (id: string, data: UpdatePromptDTO) => Promise<void>;
}

const DEFAULT_OPTIMIZER_STRATEGY = `Use concise Darwin-style prompt optimization:
- Score the A output against explicit requirements.
- Diagnose the smallest actionable reason for failure.
- Improve the prompt with minimal necessary changes.
- Make output structure, quantity, length, forbidden content, and self-check requirements executable.`;

function modelLabel(model: AIModelConfig | null | undefined): string {
  if (!model) return "";
  return [model.name, model.provider, model.model].filter(Boolean).join(" | ");
}

function toAIConfig(model: AIModelConfig): AIConfig {
  return {
    id: model.id,
    provider: model.provider,
    apiKey: model.apiKey,
    apiUrl: model.apiUrl,
    model: model.model,
    type: model.type ?? "chat",
    chatParams: model.chatParams,
  };
}

function formatPromptContent(content: PromptOptimizationPromptContent): string {
  return [
    content.systemPrompt ? `SYSTEM\n${content.systemPrompt}` : "",
    `USER\n${content.userPrompt}`,
  ].filter(Boolean).join("\n\n");
}

function snapshotToPromptContent(
  snapshot: PromptOptimizationSession["promptSnapshot"],
): PromptOptimizationPromptContent {
  return {
    systemPrompt: snapshot.systemPrompt ?? null,
    userPrompt: snapshot.userPrompt,
  };
}

interface DiffLine {
  type: "add" | "remove" | "unchanged";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function computeLineLcs(a: string[], b: string[]): number[][] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  return dp;
}

function generateLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = (oldText || "").split("\n");
  const newLines = (newText || "").split("\n");

  if (oldText === newText) {
    return oldLines.map((line, index) => ({
      type: "unchanged",
      content: line,
      oldLineNum: index + 1,
      newLineNum: index + 1,
    }));
  }

  const dp = computeLineLcs(oldLines, newLines);
  const stack: DiffLine[] = [];
  const diff: DiffLine[] = [];
  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({
        type: "unchanged",
        content: oldLines[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i -= 1;
      j -= 1;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({
        type: "add",
        content: newLines[j - 1],
        newLineNum: j,
      });
      j -= 1;
    } else if (i > 0) {
      stack.push({
        type: "remove",
        content: oldLines[i - 1],
        oldLineNum: i,
      });
      i -= 1;
    }
  }

  while (stack.length > 0) {
    diff.push(stack.pop()!);
  }

  return diff;
}

function getSessionStatusClass(session: PromptOptimizationSession): string {
  if (session.status === "passed") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  if (session.status === "error") return "bg-red-500/10 text-red-700 dark:text-red-300";
  if (session.status === "maxed") return "bg-amber-500/10 text-amber-700 dark:text-amber-300";
  return "bg-muted text-muted-foreground";
}

function patchIterationInSessions(
  sessions: PromptOptimizationSession[],
  sessionId: string,
  iterationId: string,
  patch: Partial<PromptOptimizationIteration>,
): PromptOptimizationSession[] {
  return sessions.map((session) =>
    session.id === sessionId
      ? {
          ...session,
          iterations: session.iterations.map((iteration) =>
            iteration.id === iterationId ? { ...iteration, ...patch } : iteration,
          ),
        }
      : session,
  );
}

export function PromptOptimizationWorkspace({
  prompt,
  allPrompts,
  updatePrompt,
}: PromptOptimizationWorkspaceProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const createPrompt = usePromptStore((state) => state.createPrompt);
  const aiModels = useSettingsStore((state) => state.aiModels);
  const scenarioModelDefaults = useSettingsStore((state) => state.scenarioModelDefaults);

  const chatModels = useMemo(
    () => aiModels.filter((model) => (model.type ?? "chat") === "chat"),
    [aiModels],
  );
  const defaultAModel = useMemo(
    () => resolveScenarioModel(aiModels, scenarioModelDefaults, "promptTest", "chat"),
    [aiModels, scenarioModelDefaults],
  );
  const defaultBModel = useMemo(
    () =>
      resolveScenarioModel(aiModels, scenarioModelDefaults, "promptOptimize", "chat") ??
      defaultAModel,
    [aiModels, scenarioModelDefaults, defaultAModel],
  );

  const [sessions, setSessions] = useState<PromptOptimizationSession[]>(
    prompt.promptOptimizationSessions ?? [],
  );
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    prompt.promptOptimizationSessions?.[0]?.id ?? null,
  );
  const [showNewSessionForm, setShowNewSessionForm] = useState(
    (prompt.promptOptimizationSessions ?? []).length === 0,
  );
  const [aModelId, setAModelId] = useState(defaultAModel?.id ?? "");
  const [bModelId, setBModelId] = useState(defaultBModel?.id ?? "");
  const [templatePromptId, setTemplatePromptId] = useState("");
  const [templateTitle, setTemplateTitle] = useState("Darwin Prompt Optimizer");
  const [strategyPrompt, setStrategyPrompt] = useState(DEFAULT_OPTIMIZER_STRATEGY);
  const [userCheckFocus, setUserCheckFocus] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const [runningSessionId, setRunningSessionId] = useState<string | null>(null);
  const [selectedIterationId, setSelectedIterationId] = useState<string | null>(null);
  const [diffMode, setDiffMode] = useState<"candidate" | "optimized">("candidate");
  const [promptPreviewModal, setPromptPreviewModal] = useState<{
    title: string;
    content: string;
  } | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const tr = useCallback(
    (key: string, fallback: string, options?: Record<string, unknown>) =>
      t(`promptOptimization.${key}`, { defaultValue: fallback, ...options }),
    [t],
  );
  const getStatusLabel = useCallback(
    (session: PromptOptimizationSession) => {
      if (session.status === "passed") return tr("statusPassed", "Passed");
      if (session.status === "maxed") return tr("statusMaxed", "Maxed");
      if (session.status === "error") return tr("statusError", "Error");
      if (session.status === "running") return tr("statusRunning", "Running");
      return tr("statusStopped", "Stopped");
    },
    [tr],
  );

  useEffect(() => {
    const nextSessions = prompt.promptOptimizationSessions ?? [];
    setSessions(nextSessions);
    setActiveSessionId((current) => {
      if (current && nextSessions.some((session) => session.id === current)) {
        return current;
      }
      return nextSessions[0]?.id ?? null;
    });
    setShowNewSessionForm(nextSessions.length === 0);
    setSelectedIterationId((current) =>
      current &&
      nextSessions.some((session) =>
        session.iterations.some((iteration) => iteration.id === current),
      )
        ? current
        : null,
    );
    setWorkspaceError(null);
  }, [prompt.id, prompt.promptOptimizationSessions]);

  useEffect(() => {
    setAModelId((current) => current || defaultAModel?.id || "");
    setBModelId((current) => current || defaultBModel?.id || "");
  }, [defaultAModel?.id, defaultBModel?.id]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null,
    [sessions, activeSessionId],
  );
  const selectedIteration = useMemo(() => {
    if (!activeSession || !selectedIterationId) return null;
    return activeSession.iterations.find((iteration) => iteration.id === selectedIterationId) ?? null;
  }, [activeSession, selectedIterationId]);
  const originalPromptContent = useMemo<PromptOptimizationPromptContent>(
    () => ({
      systemPrompt: prompt.systemPrompt ?? null,
      userPrompt: prompt.userPrompt,
    }),
    [prompt.systemPrompt, prompt.userPrompt],
  );
  const displayedCandidate = useMemo<PromptOptimizationPromptContent>(() => {
    if (selectedIteration) return selectedIteration.candidatePrompt;
    if (activeSession) return getLatestPromptOptimizationCandidate(activeSession);
    return originalPromptContent;
  }, [activeSession, originalPromptContent, selectedIteration]);
  const selectedIterationPosition = useMemo(() => {
    if (!activeSession || !selectedIteration) return -1;
    return activeSession.iterations.findIndex((iteration) => iteration.id === selectedIteration.id);
  }, [activeSession, selectedIteration]);
  const candidateDiffBase = useMemo<PromptOptimizationPromptContent>(() => {
    if (!activeSession) return originalPromptContent;
    if (selectedIteration) {
      const previousIteration =
        selectedIterationPosition > 0
          ? activeSession.iterations[selectedIterationPosition - 1]
          : null;
      return previousIteration?.candidatePrompt ?? snapshotToPromptContent(activeSession.promptSnapshot);
    }
    const latestIteration = activeSession.iterations.at(-1);
    return latestIteration?.candidatePrompt ?? snapshotToPromptContent(activeSession.promptSnapshot);
  }, [activeSession, originalPromptContent, selectedIteration, selectedIterationPosition]);
  const optimizedDiffCandidate = selectedIteration?.bResult?.optimizedPrompt ?? null;
  const displayedCandidateLabel = selectedIteration
    ? tr("selectedCandidateLabel", "Candidate from round {{index}}", {
        index: selectedIteration.index,
      })
    : tr("latestCandidateLabel", "Latest candidate");

  useEffect(() => {
    if (!optimizedDiffCandidate && diffMode === "optimized") {
      setDiffMode("candidate");
    }
  }, [diffMode, optimizedDiffCandidate]);

  const templatePrompts = useMemo(
    () => allPrompts.filter((candidate) => (candidate.promptType ?? "text") === "text"),
    [allPrompts],
  );

  const persistSessions = useCallback(
    async (nextSessions: PromptOptimizationSession[]) => {
      setSessions(nextSessions);
      await updatePrompt(prompt.id, { promptOptimizationSessions: nextSessions });
    },
    [prompt.id, updatePrompt],
  );

  const persistSession = useCallback(
    async (
      session: PromptOptimizationSession,
      baseSessions: PromptOptimizationSession[] = sessions,
    ): Promise<PromptOptimizationSession[]> => {
      const nextSessions = upsertPromptOptimizationSession(baseSessions, session);
      await persistSessions(nextSessions);
      return nextSessions;
    },
    [persistSessions, sessions],
  );

  const resolveModelById = useCallback(
    (modelId: string): AIModelConfig | null => chatModels.find((model) => model.id === modelId) ?? null,
    [chatModels],
  );

  const resolveRuntimeModel = useCallback(
    (snapshot: PromptOptimizationSession["aModel"] | PromptOptimizationSession["bModel"]): AIModelConfig | null => {
      return (
        chatModels.find((model) => model.id === snapshot.id) ??
        chatModels.find(
          (model) =>
            model.provider === snapshot.provider &&
            model.model === snapshot.model &&
            (!snapshot.apiUrl || model.apiUrl === snapshot.apiUrl),
        ) ??
        null
      );
    },
    [chatModels],
  );

  const runOptimizationLoop = useCallback(
    async (
      initialSession: PromptOptimizationSession,
      mode: "auto" | "manual",
      baseSessions: PromptOptimizationSession[],
    ) => {
      let session = {
        ...initialSession,
        status: "running" as const,
        completedAt: undefined,
        updatedAt: new Date().toISOString(),
      };
      let sessionList = await persistSession(session, baseSessions);
      setIsRunning(true);
      setRunningSessionId(session.id);
      setWorkspaceError(null);

      try {
        const aRuntimeModel = resolveRuntimeModel(session.aModel);
        const bRuntimeModel = resolveRuntimeModel(session.bModel);
        if (!isConfiguredModel(aRuntimeModel)) {
          throw new Error(tr("errorIncompleteAModel", "A model configuration is incomplete"));
        }
        if (!isConfiguredModel(bRuntimeModel)) {
          throw new Error(tr("errorIncompleteBModel", "B optimizer model configuration is incomplete"));
        }

        const maxNewIterations =
          mode === "auto"
            ? Math.min(
                getPromptOptimizationAutoIterationsRemaining(session),
                session.maxIterations - session.iterations.length,
              )
            : 1;

        if (maxNewIterations <= 0) {
          const now = new Date().toISOString();
          session = {
            ...session,
            status:
              session.iterations.length >= session.maxIterations ? "maxed" : "stopped",
            updatedAt: now,
            completedAt: now,
          };
          await persistSession(session, sessionList);
          return;
        }

        for (let offset = 0; offset < maxNewIterations; offset += 1) {
          if (session.iterations.length >= session.maxIterations) {
            session = {
              ...session,
              status: "maxed",
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
            };
            sessionList = await persistSession(session, sessionList);
            break;
          }

          const candidatePrompt = getLatestPromptOptimizationCandidate(session);
          const iteration: PromptOptimizationIteration = {
            id: createPromptOptimizationId("optiter"),
            index: session.iterations.length + 1,
            mode,
            candidatePrompt,
            previousFailureSummary: getPreviousFailureSummary(session),
            aModel: session.aModel,
            bModel: session.bModel,
            status: "generating",
            startedAt: new Date().toISOString(),
          };

          session = {
            ...session,
            status: "running",
            iterations: [...session.iterations, iteration],
            updatedAt: new Date().toISOString(),
            completedAt: undefined,
          };
          sessionList = await persistSession(session, sessionList);
          setSelectedIterationId(iteration.id);

          const iterationStartedAt = Date.now();
          const aMessages = buildMessagesFromPrompt(
            candidatePrompt.systemPrompt ?? undefined,
            candidatePrompt.userPrompt,
          );
          let streamedAOutput = "";
          let draftFrameId: number | null = null;
          const flushAOutputDraft = () => {
            draftFrameId = null;
            if (!streamedAOutput) {
              return;
            }
            setSessions((currentSessions) =>
              patchIterationInSessions(currentSessions, session.id, iteration.id, {
                aOutput: streamedAOutput,
              }),
            );
          };
          const scheduleAOutputDraft = () => {
            if (draftFrameId !== null) {
              return;
            }
            if (typeof requestAnimationFrame === "function") {
              draftFrameId = requestAnimationFrame(flushAOutputDraft);
            } else {
              draftFrameId = window.setTimeout(flushAOutputDraft, 100);
            }
          };
          const finishAOutputDraft = () => {
            if (draftFrameId !== null) {
              if (typeof cancelAnimationFrame === "function") {
                cancelAnimationFrame(draftFrameId);
              } else {
                clearTimeout(draftFrameId);
              }
              draftFrameId = null;
            }
            flushAOutputDraft();
          };

          let aResult: ChatCompletionResult;
          try {
            aResult = await chatCompletion(toAIConfig(aRuntimeModel), aMessages, {
              stream: true,
              enableThinking: false,
              streamCallbacks: {
                onContent: (chunk) => {
                  streamedAOutput += chunk;
                  scheduleAOutputDraft();
                },
                onComplete: (fullContent) => {
                  streamedAOutput = fullContent || streamedAOutput;
                  finishAOutputDraft();
                },
              },
            });
          } catch (streamError) {
            finishAOutputDraft();
            if (streamedAOutput.trim()) {
              throw streamError;
            }
            console.warn(
              "[PromptOptimization] A model streaming failed before content; retrying buffered request.",
              streamError,
            );
            aResult = await chatCompletion(toAIConfig(aRuntimeModel), aMessages, {
              stream: false,
              enableThinking: false,
            });
          } finally {
            finishAOutputDraft();
          }

          const aOutput = streamedAOutput || aResult.content;

          let nextIteration: PromptOptimizationIteration = {
            ...iteration,
            aOutput,
            status: "checking",
          };
          session = {
            ...session,
            iterations: session.iterations.map((item) =>
              item.id === iteration.id ? nextIteration : item,
            ),
            updatedAt: new Date().toISOString(),
          };
          sessionList = await persistSession(session, sessionList);

          const bMessages = buildBOptimizerMessages({
            strategyPrompt: session.optimizerTemplate.strategyPrompt,
            promptTitle: session.promptSnapshot.title,
            promptDescription: session.promptSnapshot.description,
            originalPrompt: {
              systemPrompt: session.promptSnapshot.systemPrompt ?? null,
              userPrompt: session.promptSnapshot.userPrompt,
            },
            currentCandidatePrompt: candidatePrompt,
            aModel: session.aModel,
            aOutput,
            explicitRequirements: session.explicitRequirements,
            userCheckFocus: session.userCheckFocus,
            previousFailureSummary: iteration.previousFailureSummary,
            iteration: {
              index: iteration.index,
              max: session.maxIterations,
              mode,
            },
          });
          const bResult = await chatCompletion(toAIConfig(bRuntimeModel), bMessages, {
            stream: false,
            enableThinking: false,
            responseFormat: { type: "json_object" },
          });
          let parsedResult: ReturnType<typeof parseBOptimizerResult> | undefined;
          try {
            parsedResult = parseBOptimizerResult(bResult.content);
          } catch (error) {
            if (!isBOptimizerJsonFormatError(error)) {
              throw error;
            }

            const locallyRepairedContent = repairBOptimizerJsonLocally(bResult.content);
            if (locallyRepairedContent) {
              try {
                const locallyRepairedParsedResult =
                  parseBOptimizerResult(locallyRepairedContent);
                parsedResult = {
                  ...locallyRepairedParsedResult,
                  warnings: [
                    ...locallyRepairedParsedResult.warnings,
                    B_OPTIMIZER_LOCAL_JSON_REPAIR_WARNING,
                  ],
                };
              } catch (localRepairError) {
                if (!isBOptimizerJsonFormatError(localRepairError)) {
                  throw localRepairError;
                }
              }
            }

            if (!parsedResult) {
              const repairedBResult = await chatCompletion(
                toAIConfig(bRuntimeModel),
                buildBOptimizerJsonRepairMessages({ rawContent: bResult.content }),
                {
                  stream: false,
                  enableThinking: false,
                  responseFormat: { type: "json_object" },
                },
              );
              const repairedParsedResult = parseBOptimizerResult(repairedBResult.content);
              parsedResult = {
                ...repairedParsedResult,
                warnings: [
                  ...repairedParsedResult.warnings,
                  B_OPTIMIZER_JSON_REPAIR_WARNING,
                ],
              };
            }
          }
          if (!parsedResult) {
            throw new Error(tr("errorIterationFailed", "Optimization iteration failed"));
          }
          const completedAt = new Date().toISOString();

          nextIteration = {
            ...nextIteration,
            bResult: parsedResult,
            status: parsedResult.passed ? "passed" : "optimized",
            completedAt,
            latencyMs: Date.now() - iterationStartedAt,
          };

          const completedIterations = session.iterations.map((item) =>
            item.id === iteration.id ? nextIteration : item,
          );
          const reachedMax = completedIterations.length >= session.maxIterations;
          const shouldContinueAuto =
            mode === "auto" &&
            offset + 1 < maxNewIterations &&
            !parsedResult.passed &&
            !reachedMax;

          session = {
            ...session,
            iterations: completedIterations,
            currentCandidatePrompt: parsedResult.optimizedPrompt,
            status: parsedResult.passed
              ? "passed"
              : reachedMax
                ? "maxed"
                : "stopped",
            updatedAt: completedAt,
            completedAt:
              parsedResult.passed || reachedMax || !shouldContinueAuto
                ? completedAt
                : session.completedAt,
          };
          sessionList = await persistSession(session, sessionList);

          if (!shouldContinueAuto) {
            break;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : tr("errorIterationFailed", "Optimization iteration failed");
        const now = new Date().toISOString();
        const iterations = session.iterations.map((iteration, index, list) =>
          index === list.length - 1 && !iteration.completedAt
            ? {
                ...iteration,
                status: "error" as const,
                error: message,
                completedAt: now,
              }
            : iteration,
        );
        session = {
          ...session,
          status: "error",
          iterations,
          updatedAt: now,
          completedAt: now,
        };
        await persistSession(session, sessionList);
        setWorkspaceError(message);
        showToast(message, "error");
      } finally {
        setIsRunning(false);
        setRunningSessionId(null);
      }
    },
    [persistSession, resolveRuntimeModel, showToast, tr],
  );

  const handleTemplateSelect = (promptId: string) => {
    setTemplatePromptId(promptId);
    const selectedTemplate = templatePrompts.find((item) => item.id === promptId);
    if (!selectedTemplate) {
      setTemplateTitle("Darwin Prompt Optimizer");
      setStrategyPrompt(DEFAULT_OPTIMIZER_STRATEGY);
      return;
    }
    setTemplateTitle(selectedTemplate.title);
    setStrategyPrompt(
      formatPromptContent({
        systemPrompt: selectedTemplate.systemPrompt ?? null,
        userPrompt: selectedTemplate.userPrompt,
      }),
    );
  };

  const handleStartNewSession = async () => {
    const aModel = resolveModelById(aModelId);
    const bModel = resolveModelById(bModelId);
    if (!isConfiguredModel(aModel)) {
      showToast(tr("toastSelectAModel", "Select a fully configured A model first"), "error");
      return;
    }
    if (!isConfiguredModel(bModel)) {
      showToast(tr("toastSelectBModel", "Select a fully configured B optimizer model first"), "error");
      return;
    }
    if (!strategyPrompt.trim()) {
      showToast(tr("toastSelectTemplate", "Enter or choose a B optimizer template"), "error");
      return;
    }

    const selectedTemplate = templatePrompts.find((item) => item.id === templatePromptId);
    const session = createPromptOptimizationSession({
      prompt,
      aModel,
      bModel,
      optimizerTemplate: {
        id: selectedTemplate?.id,
        title: templateTitle.trim() || selectedTemplate?.title || "B Optimizer Template",
        sourcePromptId: selectedTemplate?.id,
        strategyPrompt,
      },
      userCheckFocus,
      explicitRequirements: extractExplicitRequirements(prompt.systemPrompt, prompt.userPrompt),
    });

    const nextSessions = upsertPromptOptimizationSession(sessions, session);
    setActiveSessionId(session.id);
    setShowNewSessionForm(false);
    await persistSessions(nextSessions);
    await runOptimizationLoop(session, "auto", nextSessions);
  };

  const handleContinueSession = async () => {
    if (isRunning || !activeSession || !canContinuePromptOptimizationSession(activeSession)) return;
    await runOptimizationLoop(activeSession, "manual", sessions);
  };

  const handleStopActiveIteration = async () => {
    if (isRunning || !activeSession) return;
    const latestIteration = activeSession.iterations.at(-1);
    if (
      !latestIteration ||
      (latestIteration.status !== "generating" && latestIteration.status !== "checking")
    ) {
      return;
    }

    const now = new Date().toISOString();
    const message = tr(
      "stoppedActiveIteration",
      "Stopped before completion. Continue the session to retry from the latest optimized Prompt.",
    );
    const nextSession: PromptOptimizationSession = {
      ...activeSession,
      status: "stopped",
      iterations: activeSession.iterations.map((iteration) =>
        iteration.id === latestIteration.id
          ? {
              ...iteration,
              status: "error",
              error: message,
              completedAt: now,
              latencyMs: Date.now() - Date.parse(iteration.startedAt),
            }
          : iteration,
      ),
      updatedAt: now,
      completedAt: now,
    };

    await persistSession(nextSession, sessions);
    setSelectedIterationId(latestIteration.id);
    showToast(message, "info");
  };

  const handleDeleteSession = async (sessionId: string) => {
    const nextSessions = deletePromptOptimizationSession(sessions, sessionId);
    setActiveSessionId((current) => (current === sessionId ? nextSessions[0]?.id ?? null : current));
    await persistSessions(nextSessions);
  };

  const handleApplyCandidate = async () => {
    if (!activeSession) return;
    const candidate = getLatestPromptOptimizationCandidate(activeSession);
    await updatePrompt(prompt.id, {
      systemPrompt: candidate.systemPrompt ?? "",
      userPrompt: candidate.userPrompt,
      promptOptimizationSessions: sessions,
    });
    showToast(tr("toastApplied", "Optimization applied and a Prompt version was created"), "success");
  };

  const handleSaveTemplate = async () => {
    if (!strategyPrompt.trim()) return;
    const created = await createPrompt({
      title: templateTitle.trim() || "Prompt Optimizer Template",
      description: tr("templateDescription", "B optimizer strategy template"),
      promptType: "text",
      userPrompt: strategyPrompt,
      variables: [],
      tags: ["prompt-optimizer-template"],
    });
    setTemplatePromptId(created.id);
    showToast(tr("toastTemplateSaved", "Saved as a B optimizer template"), "success");
  };

  const latestActiveIteration = activeSession?.iterations.at(-1) ?? null;
  const canStopActiveIteration =
    !isRunning &&
    latestActiveIteration !== null &&
    (latestActiveIteration.status === "generating" ||
      latestActiveIteration.status === "checking");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <SparklesIcon className="h-4 w-4 text-primary" />
            <span>{tr("title", "Prompt Optimization")}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {tr("subtitle", "A runs the current candidate; B checks explicit requirements and creates the next candidate.")}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowNewSessionForm(true)}
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-accent"
        >
          <PlusIcon className="h-4 w-4" />
          <span>{tr("newSession", "New optimization session")}</span>
        </button>
      </div>

      {workspaceError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {workspaceError}
        </div>
      )}

      {showNewSessionForm && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{tr("newSession", "New optimization session")}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {tr("newSessionDescription", "The original Prompt is pulled in automatically; after start, the B model, template, and check focus are locked as a snapshot.")}
              </div>
            </div>
            {sessions.length > 0 && (
              <button
                type="button"
                onClick={() => setShowNewSessionForm(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{tr("aModel", "A execution model")}</span>
              <select
                value={aModelId}
                onChange={(event) => setAModelId(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">{tr("selectModel", "Select model")}</option>
                {chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {modelLabel(model)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm">
              <span className="text-xs font-medium text-muted-foreground">{tr("bModel", "B optimizer model")}</span>
              <select
                value={bModelId}
                onChange={(event) => setBModelId(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">{tr("selectModel", "Select model")}</option>
                {chatModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {modelLabel(model)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm lg:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">{tr("bTemplate", "B optimizer template")}</span>
              <select
                value={templatePromptId}
                onChange={(event) => handleTemplateSelect(event.target.value)}
                className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">{tr("builtinTemplate", "Built-in Darwin optimization strategy")}</option>
                {templatePrompts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5 text-sm lg:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">{tr("strategyPreview", "Template preview / strategy for this run")}</span>
              <textarea
                value={strategyPrompt}
                onChange={(event) => setStrategyPrompt(event.target.value)}
                rows={5}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="space-y-1.5 text-sm lg:col-span-2">
              <span className="text-xs font-medium text-muted-foreground">{tr("checkFocus", "Check focus for this run")}</span>
              <textarea
                value={userCheckFocus}
                onChange={(event) => setUserCheckFocus(event.target.value)}
                rows={3}
                placeholder={tr("checkFocusPlaceholder", "Optional; the system will still extract explicit requirements from the current Prompt.")}
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleStartNewSession}
              disabled={isRunning}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {isRunning ? <LoaderIcon className="h-4 w-4 animate-spin" /> : <PlayIcon className="h-4 w-4" />}
              <span>{tr("start", "Start optimization")}</span>
            </button>
            <button
              type="button"
              onClick={handleSaveTemplate}
              disabled={!strategyPrompt.trim()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
            >
              <PlusIcon className="h-4 w-4" />
              <span>{tr("saveTemplate", "Save as template")}</span>
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <HistoryIcon className="h-3.5 w-3.5" />
              <span>{tr("sessionHistory", "Session history")}</span>
            </div>
            {activeSession ? (
              <span className={`rounded px-1.5 py-0.5 text-[10px] ${getSessionStatusClass(activeSession)}`}>
                {getStatusLabel(activeSession)}
              </span>
            ) : null}
          </div>
          {sessions.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {tr("noSessions", "No optimization sessions yet.")}
            </div>
          ) : (
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr),12rem]">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {activeSession?.optimizerTemplate.title}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {tr("iterationCount", "{{count}}/{{max}} rounds", {
                      count: activeSession?.iterations.length ?? 0,
                      max: activeSession?.maxIterations ?? MAX_PROMPT_OPTIMIZATION_ITERATIONS,
                    })}
                  </span>
                  {activeSession ? (
                    <span>{new Date(activeSession.createdAt).toLocaleDateString()}</span>
                  ) : null}
                  {activeSession ? <span>B: {activeSession.bModel.model}</span> : null}
                </div>
              </div>
              <select
                value={activeSession?.id ?? ""}
                onChange={(event) => {
                  setActiveSessionId(event.target.value || null);
                  setSelectedIterationId(null);
                  setShowNewSessionForm(false);
                }}
                className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                {sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.optimizerTemplate.title} · {getStatusLabel(session)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-muted-foreground">
              <PanelRightOpenIcon className="h-3.5 w-3.5" />
              <span>{tr("roundSelection", "Round selection")}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {tr("iterationLimits", "Auto up to 3 rounds; each session up to {{max}} rounds", {
                max: MAX_PROMPT_OPTIMIZATION_ITERATIONS,
              })}
            </div>
          </div>
          {activeSession ? (
            <div className="grid gap-2 md:grid-cols-[minmax(0,1fr),12rem]">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{displayedCandidateLabel}</div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {selectedIteration
                    ? selectedIteration.bResult?.changeSummary ||
                      selectedIteration.error ||
                      tr("waitingModel", "Waiting for model output")
                    : tr("latestCandidateSummary", "Showing the latest candidate from this session.")}
                </div>
              </div>
              <select
                value={selectedIterationId ?? ""}
                onChange={(event) => setSelectedIterationId(event.target.value || null)}
                className="h-9 w-full rounded-lg border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">{tr("latestCandidateOption", "Latest candidate")}</option>
                {activeSession.iterations.map((iteration) => (
                  <option key={iteration.id} value={iteration.id}>
                    {tr("roundOption", "Round {{index}}", { index: iteration.index })} · {iteration.status}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
              {tr("timelineEmpty", "Round status appears after the session starts.")}
            </div>
          )}
        </div>
      </div>

      <section className="min-w-0 space-y-4">
        {activeSession ? (
          <>
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-2 py-1 text-xs ${getSessionStatusClass(activeSession)}`}>
                      {getStatusLabel(activeSession)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      A: {activeSession.aModel.model}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      B: {activeSession.bModel.model}
                    </span>
                  </div>
                  <div className="mt-2 text-sm font-semibold">
                    {tr("currentCandidate", "Current candidate Prompt")}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{displayedCandidateLabel}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleContinueSession}
                    disabled={isRunning || !canContinuePromptOptimizationSession(activeSession)}
                    className="inline-flex h-8 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-medium text-white hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isRunning && runningSessionId === activeSession.id ? (
                      <LoaderIcon className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <PlayIcon className="h-3.5 w-3.5" />
                    )}
                    <span>{tr("continueSession", "Continue session")}</span>
                  </button>
                  {canStopActiveIteration && (
                    <button
                      type="button"
                      onClick={handleStopActiveIteration}
                      className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
                    >
                      <XIcon className="h-3.5 w-3.5" />
                      <span>{tr("stopActiveIteration", "Stop current round")}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleApplyCandidate}
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-accent"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                    <span>{tr("applyCandidate", "Apply optimized result")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteSession(activeSession.id)}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 px-2 text-red-700 hover:bg-red-500/20 dark:text-red-300"
                    title={tr("deleteSession", "Delete session")}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <PromptPanel
                  title={tr("systemPrompt", "System")}
                  content={displayedCandidate.systemPrompt || ""}
                  emptyLabel={tr("empty", "(empty)")}
                  onOpen={() =>
                    setPromptPreviewModal({
                      title: tr("systemPrompt", "System"),
                      content: displayedCandidate.systemPrompt || tr("empty", "(empty)"),
                    })
                  }
                />
                <PromptPanel
                  title={tr("userPrompt", "User")}
                  content={displayedCandidate.userPrompt}
                  emptyLabel={tr("empty", "(empty)")}
                  onOpen={() =>
                    setPromptPreviewModal({
                      title: tr("userPrompt", "User"),
                      content: displayedCandidate.userPrompt,
                    })
                  }
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <GitCompareIcon className="h-4 w-4 text-primary" />
                  <span>{tr("promptDiff", "Prompt diff")}</span>
                </div>
                {optimizedDiffCandidate ? (
                  <div className="flex rounded-lg border border-border bg-background p-1">
                    <button
                      type="button"
                      onClick={() => setDiffMode("candidate")}
                      className={`h-7 rounded-md px-2 text-xs font-medium ${
                        diffMode === "candidate"
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {tr("diffDisplayedCandidate", "Displayed candidate")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiffMode("optimized")}
                      className={`h-7 rounded-md px-2 text-xs font-medium ${
                        diffMode === "optimized"
                          ? "bg-primary text-white"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {tr("diffBOptimized", "B optimized")}
                    </button>
                  </div>
                ) : null}
              </div>
              <PromptDiffView
                oldPrompt={
                  diffMode === "optimized" && optimizedDiffCandidate
                    ? selectedIteration?.candidatePrompt ?? displayedCandidate
                    : candidateDiffBase
                }
                newPrompt={
                  diffMode === "optimized" && optimizedDiffCandidate
                    ? optimizedDiffCandidate
                    : displayedCandidate
                }
                systemLabel={tr("systemPrompt", "System")}
                userLabel={tr("userPrompt", "User")}
                emptyLabel={tr("diffUnchanged", "No line-level changes.")}
                oldLabel={
                  diffMode === "optimized" && optimizedDiffCandidate
                    ? tr("diffInputLabel", "Round input candidate")
                    : tr("diffPreviousLabel", "Previous candidate")
                }
                newLabel={
                  diffMode === "optimized" && optimizedDiffCandidate
                    ? tr("diffOptimizedLabel", "B optimized candidate")
                    : tr("diffCurrentLabel", "Displayed candidate")
                }
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-sm font-semibold">{tr("iterationDetail", "Round detail")}</div>
                {selectedIteration ? (
                  <button
                    type="button"
                    onClick={() => setSelectedIterationId(null)}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    title={tr("showLatestCandidate", "Show latest candidate")}
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              {selectedIteration ? (
                <IterationDetail iteration={selectedIteration} tr={tr} />
              ) : (
                <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                  {tr("selectIterationHint", "Select a round above to inspect A output, B analysis, and the failure summary passed to the next round.")}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {tr("emptyWorkspace", "Create an optimization session to start iterating.")}
          </div>
        )}
      </section>

      <Modal
        isOpen={promptPreviewModal !== null}
        onClose={() => setPromptPreviewModal(null)}
        title={promptPreviewModal?.title}
        size="fullscreen"
      >
        <pre className="h-full min-h-[55vh] whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-4 text-sm leading-relaxed">
          {promptPreviewModal?.content}
        </pre>
      </Modal>
    </div>
  );
}

function PromptPanel({
  title,
  content,
  emptyLabel,
  onOpen,
}: {
  title: string;
  content: string;
  emptyLabel: string;
  onOpen: () => void;
}) {
  return (
    <div className="min-h-44 rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase text-muted-foreground">
          {title}
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={title}
        >
          <Maximize2Icon className="h-3.5 w-3.5" />
        </button>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words pr-1 text-sm leading-relaxed">
        {content || emptyLabel}
      </pre>
    </div>
  );
}

function PromptDiffView({
  oldPrompt,
  newPrompt,
  systemLabel,
  userLabel,
  oldLabel,
  newLabel,
  emptyLabel,
}: {
  oldPrompt: PromptOptimizationPromptContent;
  newPrompt: PromptOptimizationPromptContent;
  systemLabel: string;
  userLabel: string;
  oldLabel: string;
  newLabel: string;
  emptyLabel: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{oldLabel}</span>
        <span>-&gt;</span>
        <span>{newLabel}</span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <PromptTextDiff
          label={systemLabel}
          oldText={oldPrompt.systemPrompt ?? ""}
          newText={newPrompt.systemPrompt ?? ""}
          emptyLabel={emptyLabel}
        />
        <PromptTextDiff
          label={userLabel}
          oldText={oldPrompt.userPrompt}
          newText={newPrompt.userPrompt}
          emptyLabel={emptyLabel}
        />
      </div>
    </div>
  );
}

function PromptTextDiff({
  label,
  oldText,
  newText,
  emptyLabel,
}: {
  label: string;
  oldText: string;
  newText: string;
  emptyLabel: string;
}) {
  const diff = useMemo(() => generateLineDiff(oldText, newText), [oldText, newText]);
  const stats = useMemo(
    () => ({
      added: diff.filter((line) => line.type === "add").length,
      removed: diff.filter((line) => line.type === "remove").length,
    }),
    [diff],
  );
  const isUnchanged = stats.added === 0 && stats.removed === 0;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
        {!isUnchanged ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-600 dark:text-green-300">
              <PlusIcon className="h-3 w-3" />
              {stats.added}
            </span>
            <span className="flex items-center gap-1 text-red-600 dark:text-red-300">
              <MinusIcon className="h-3 w-3" />
              {stats.removed}
            </span>
          </div>
        ) : null}
      </div>
      {isUnchanged ? (
        <div className="rounded-lg border border-dashed border-border bg-background p-3 text-sm text-muted-foreground">
          {emptyLabel}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-background font-mono text-xs">
          <div className="max-h-72 overflow-auto">
            {diff.map((line, index) => (
              <div
                key={`${line.type}-${index}-${line.oldLineNum ?? 0}-${line.newLineNum ?? 0}`}
                className={`flex ${
                  line.type === "add"
                    ? "bg-green-500/15 text-green-700 dark:text-green-300"
                    : line.type === "remove"
                      ? "bg-red-500/15 text-red-700 dark:text-red-300"
                      : "text-foreground/80"
                }`}
              >
                <div className="flex w-16 flex-shrink-0 select-none border-r border-border/60 text-muted-foreground/60">
                  <span className="w-8 border-r border-border/40 px-1 text-right">
                    {line.oldLineNum || ""}
                  </span>
                  <span className="w-8 px-1 text-right">
                    {line.newLineNum || ""}
                  </span>
                </div>
                <div className="w-5 flex-shrink-0 text-center font-bold">
                  {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
                </div>
                <div className="min-w-0 flex-1 whitespace-pre-wrap break-words px-2 py-0.5">
                  {line.content || " "}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IterationDetail({
  iteration,
  tr,
}: {
  iteration: PromptOptimizationIteration;
  tr: (key: string, fallback: string, options?: Record<string, unknown>) => string;
}) {
  const copy = async (value: string) => {
    await navigator.clipboard.writeText(value);
  };

  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
          {tr("status", "Status")}
        </div>
        <div>{iteration.status}</div>
      </div>
      {iteration.error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-700 dark:text-red-300">
          {iteration.error}
        </div>
      )}
      <DetailBlock
        title={tr("aOutput", "A output")}
        content={iteration.aOutput || ""}
        onCopy={() => copy(iteration.aOutput || "")}
        emptyLabel={tr("empty", "(empty)")}
      />
      <DetailBlock
        title={tr("bAnalysis", "B analysis")}
        content={iteration.bResult?.analysis || ""}
        emptyLabel={tr("empty", "(empty)")}
      />
      <DetailBlock
        title={tr("changeSummary", "Change summary")}
        content={iteration.bResult?.changeSummary || ""}
        emptyLabel={tr("empty", "(empty)")}
      />
      <DetailBlock
        title={tr("nextFailureSummary", "Failure summary for next round")}
        content={
          iteration.bResult
            ? [
                `${tr("unmetItems", "Unmet items")}: ${
                  iteration.bResult.nextFailureSummary.unmetItems.join(", ") ||
                  tr("empty", "(empty)")
                }`,
                `${tr("cause", "Cause")}: ${
                  iteration.bResult.nextFailureSummary.cause || tr("empty", "(empty)")
                }`,
                `${tr("avoidRepeatAdvice", "Avoid-repeat advice")}: ${
                  iteration.bResult.nextFailureSummary.avoidRepeatAdvice ||
                  tr("empty", "(empty)")
                }`,
              ].join("\n")
            : ""
        }
        emptyLabel={tr("empty", "(empty)")}
      />
      <DetailBlock
        title={tr("optimizedPrompt", "Optimized Prompt")}
        content={iteration.bResult ? formatPromptContent(iteration.bResult.optimizedPrompt) : ""}
        onCopy={() =>
          copy(iteration.bResult ? formatPromptContent(iteration.bResult.optimizedPrompt) : "")
        }
        emptyLabel={tr("empty", "(empty)")}
      />
    </div>
  );
}

function DetailBlock({
  title,
  content,
  onCopy,
  emptyLabel = "(empty)",
}: {
  title: string;
  content: string;
  onCopy?: () => void;
  emptyLabel?: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase text-muted-foreground">{title}</div>
        {onCopy && content && (
          <button
            type="button"
            onClick={onCopy}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <CopyIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-3 text-xs leading-relaxed">
        {content || emptyLabel}
      </pre>
    </div>
  );
}
