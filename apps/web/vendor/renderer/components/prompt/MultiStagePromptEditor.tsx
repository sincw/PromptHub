import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon } from "lucide-react";
import type { Prompt, PromptStage, PromptStageContextMode, PromptStageSmartConfig } from "@prompthub/shared/types";
import type { AIModelConfig } from "../../stores/settings.store";
import { Button, Textarea } from "../ui";
import { Select } from "../ui/Select";
import { useTranslation } from "react-i18next";
import {
  MULTI_STAGE_MAX_STAGE_COUNT,
  MULTI_STAGE_MIN_STAGE_COUNT,
  SMART_STAGE_MAX_ROUNDS,
  SMART_STAGE_MIN_ROUNDS,
  createPromptStage,
  getStageDisplayName,
  isStageReferenced,
  normalizeSmartStageConfig,
  normalizePromptStages,
  validatePromptStageReferences,
} from "./prompt-modal-utils";

interface MultiStagePromptEditorProps {
  stages: PromptStage[];
  onChange: (stages: PromptStage[]) => void;
  stageContextMode: PromptStageContextMode;
  onStageContextModeChange: (mode: PromptStageContextMode) => void;
  showEnglishVersion: boolean;
  prompts: Prompt[];
  aiModels: AIModelConfig[];
}

export function MultiStagePromptEditor({
  stages,
  onChange,
  stageContextMode,
  onStageContextModeChange,
  showEnglishVersion,
  prompts,
  aiModels,
}: MultiStagePromptEditorProps) {
  const { t } = useTranslation();
  const normalizedStages = normalizePromptStages(stages);
  const [collapsedStageIds, setCollapsedStageIds] = useState<Set<string>>(() => new Set());
  const validationErrors = validatePromptStageReferences(normalizedStages);
  const chatModels = aiModels.filter((model) => (model.type ?? "chat") === "chat");
  const promptOptions = prompts
    .filter((prompt) => (prompt.promptType ?? "text") === "text")
    .map((prompt) => ({ value: prompt.id, label: prompt.title }));
  const modelOptions = chatModels.map((model) => ({
    value: model.id,
    label: model.name ? `${model.name} (${model.model})` : `${model.provider} / ${model.model}`,
  }));

  const updateStage = (
    index: number,
    patch: Partial<PromptStage>,
  ) => {
    onChange(
      normalizedStages.map((stage, stageIndex) =>
        stageIndex === index ? { ...stage, ...patch } : stage,
      ),
    );
  };

  const updateSmartConfig = (
    index: number,
    patch: Partial<PromptStageSmartConfig>,
  ) => {
    const current = normalizeSmartStageConfig(normalizedStages[index].smartConfig);
    updateStage(index, {
      type: "smart",
      smartConfig: { ...current, ...patch },
    });
  };

  const appendStage = () => {
    if (normalizedStages.length >= MULTI_STAGE_MAX_STAGE_COUNT) return;
    onChange([...normalizedStages, createPromptStage(normalizedStages.length + 1)]);
  };

  const removeStage = (index: number) => {
    if (normalizedStages.length <= MULTI_STAGE_MIN_STAGE_COUNT) return;
    if (isStageReferenced(normalizedStages, index)) return;
    const nextStages = normalizedStages
      .filter((_, stageIndex) => stageIndex !== index)
      .map((stage, stageIndex) => ({ ...stage, id: `stage${stageIndex + 1}` }));
    onChange(nextStages);
  };

  const toggleStageCollapsed = (stageId: string) => {
    setCollapsedStageIds((prev) => {
      const next = new Set(prev);
      if (next.has(stageId)) {
        next.delete(stageId);
      } else {
        next.add(stageId);
      }
      return next;
    });
  };

  const insertReference = (
    stageIndex: number,
    refIndex: number,
    kind: "input" | "output" = "output",
  ) => {
    const token = `@stage${refIndex + 1}.${kind}`;
    const stage = normalizedStages[stageIndex];
    if (stage.type === "smart") {
      const current = normalizeSmartStageConfig(stage.smartConfig);
      updateSmartConfig(stageIndex, {
        agentUserPrompt: `${current.agentUserPrompt}${current.agentUserPrompt ? " " : ""}${token}`,
      });
      return;
    }
    updateStage(stageIndex, {
      userPrompt: `${stage.userPrompt}${stage.userPrompt ? " " : ""}${token}`,
    });
  };

  const applyPromptSnapshot = (stageIndex: number, promptId: string) => {
    const prompt = prompts.find((item) => item.id === promptId);
    if (!prompt) return;
    updateSmartConfig(stageIndex, {
      sourcePromptId: prompt.id,
      sourcePromptTitle: prompt.title,
      agentSystemPrompt: prompt.systemPrompt || "",
      agentUserPrompt: prompt.userPrompt || "",
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/20 p-3">
        <div className="mb-2 text-sm font-medium text-foreground">
          {t("prompt.stageContextMode", "阶段上下文")}
        </div>
        <div className="flex flex-wrap gap-2">
          {([
            ["isolated", t("prompt.stageContextIsolated", "隔离阶段")],
            ["inherited", t("prompt.stageContextInherited", "继承上下文")],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => onStageContextModeChange(mode)}
              className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                stageContextMode === mode
                  ? "bg-primary text-white"
                  : "bg-background border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {normalizedStages.map((stage, index) => {
        const referenced = isStageReferenced(normalizedStages, index);
        const collapsed = collapsedStageIds.has(stage.id);
        return (
          <div key={stage.id} className="rounded-xl border border-border bg-background p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => toggleStageCollapsed(stage.id)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left text-sm font-semibold text-foreground hover:bg-muted/50"
                title={collapsed ? t("common.expand", "展开") : t("common.collapse", "收起")}
              >
                {collapsed ? (
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{getStageDisplayName(stage, index)}</span>
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => removeStage(index)}
                  disabled={normalizedStages.length <= MULTI_STAGE_MIN_STAGE_COUNT || referenced}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:hover:text-muted-foreground disabled:hover:bg-transparent"
                  title={
                    referenced
                      ? t("prompt.stageDeleteBlocked", "该阶段被后续阶段引用，需先移除引用")
                      : t("common.delete", "Delete")
                  }
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {!collapsed && (
              <>
                <input
                  type="text"
                  value={stage.title || ""}
                  onChange={(event) => updateStage(index, { title: event.target.value })}
                  placeholder={t("prompt.stageTitlePlaceholder", "阶段标题（可选）")}
                  className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                />

                <div className="flex gap-2">
                  {([
                    ["fixed", t("prompt.fixedStage", "普通阶段")],
                    ["smart", t("prompt.smartStage", "智能阶段")],
                  ] as const).map(([type, label]) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        updateStage(index, {
                          type,
                          smartConfig: type === "smart"
                            ? normalizeSmartStageConfig(stage.smartConfig)
                            : null,
                        })
                      }
                      className={`h-8 rounded-lg px-3 text-xs font-medium transition-colors ${
                        (stage.type ?? "fixed") === type
                          ? "bg-primary text-white"
                          : "bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {index > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">{t("prompt.insertStageOutput", "插入输出")}</span>
                    {normalizedStages.slice(0, index).map((prevStage, prevIndex) => (
                      <span key={prevStage.id} className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => insertReference(index, prevIndex, "output")}
                          className="rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                        >
                          @{prevStage.id}.output
                        </button>
                        {(prevStage.type === "smart") && (
                          <button
                            type="button"
                            onClick={() => insertReference(index, prevIndex, "input")}
                            className="rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                          >
                            @{prevStage.id}.input
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {stage.type === "smart" ? (
                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          {t("prompt.smartStageAgentModel", "Agent 模型")}
                        </label>
                        <Select
                          value={stage.smartConfig?.agentModelId || ""}
                          onChange={(value) => updateSmartConfig(index, { agentModelId: value })}
                          options={modelOptions}
                          placeholder={t("prompt.selectAgentModel", "选择 Agent 模型")}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">
                          {t("prompt.smartStageRounds", "轮次")}
                        </label>
                        <input
                          type="number"
                          min={SMART_STAGE_MIN_ROUNDS}
                          max={SMART_STAGE_MAX_ROUNDS}
                          value={normalizeSmartStageConfig(stage.smartConfig).rounds}
                          onChange={(event) =>
                            updateSmartConfig(index, {
                              rounds: Number(event.target.value),
                            })
                          }
                          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t("prompt.smartStageAgentContext", "Agent 上下文")}
                      </label>
                      <Select
                        value={normalizeSmartStageConfig(stage.smartConfig).agentContextMode || "inherited"}
                        onChange={(value) =>
                          updateSmartConfig(index, {
                            agentContextMode: value === "stage_local" ? "stage_local" : "inherited",
                          })
                        }
                        options={[
                          {
                            value: "inherited",
                            label: t("prompt.smartStageAgentContextInherited", "继承智能阶段内部上下文"),
                          },
                          {
                            value: "stage_local",
                            label: t("prompt.smartStageAgentContextLocal", "仅本轮输入"),
                          },
                        ]}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t("prompt.copyFromPrompt", "从 Prompt 复制")}
                      </label>
                      <Select
                        value={stage.smartConfig?.sourcePromptId || ""}
                        onChange={(value) => applyPromptSnapshot(index, value)}
                        options={promptOptions}
                        placeholder={t("prompt.selectPrompt", "选择一个提示词")}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t("prompt.systemPrompt", "系统提示词")}
                      </label>
                      <Textarea
                        value={stage.smartConfig?.agentSystemPrompt || ""}
                        onChange={(event) => updateSmartConfig(index, { agentSystemPrompt: event.target.value })}
                        placeholder={t("prompt.systemPromptPlaceholder", "可选的系统说明")}
                        className="min-h-[90px]"
                        enableMarkdownList
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t("prompt.userPrompt", "用户提示词")}
                      </label>
                      <Textarea
                        value={stage.smartConfig?.agentUserPrompt || ""}
                        onChange={(event) => updateSmartConfig(index, { agentUserPrompt: event.target.value })}
                        placeholder={t("prompt.smartStageUserPromptPlaceholder", "输入 Agent 用来生成本阶段输入的提示词")}
                        className="min-h-[120px]"
                        enableMarkdownList
                      />
                    </div>
                  </div>
                ) : (
                  <Textarea
                    value={stage.userPrompt}
                    onChange={(event) => updateStage(index, { userPrompt: event.target.value })}
                    placeholder={t("prompt.stagePromptPlaceholder", "输入该阶段的 User Prompt")}
                    className="min-h-[140px]"
                    enableMarkdownList
                  />
                )}

                {showEnglishVersion && stage.type !== "smart" && (
                  <div className="pl-4 border-l-2 border-primary/20 space-y-2">
                    <label className="text-xs font-medium text-muted-foreground">
                      EN {t("prompt.stagePrompt", "Stage Prompt")}
                    </label>
                    <Textarea
                      value={stage.userPromptEn || ""}
                      onChange={(event) => updateStage(index, { userPromptEn: event.target.value })}
                      placeholder={t("prompt.stagePromptEnPlaceholder", "Enter English stage prompt...")}
                      className="min-h-[100px]"
                      enableMarkdownList
                    />
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}

      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
          {validationErrors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={appendStage}
        disabled={normalizedStages.length >= MULTI_STAGE_MAX_STAGE_COUNT}
      >
        <PlusIcon className="h-4 w-4" />
        {t("prompt.addStage", "添加阶段")}
      </Button>
    </div>
  );
}
