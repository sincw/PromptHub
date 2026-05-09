import { PlusIcon, TrashIcon } from "lucide-react";
import type { PromptStage, PromptStageContextMode } from "@prompthub/shared/types";
import { Button, Textarea } from "../ui";
import { useTranslation } from "react-i18next";
import {
  MULTI_STAGE_MAX_STAGE_COUNT,
  MULTI_STAGE_MIN_STAGE_COUNT,
  createPromptStage,
  getStageDisplayName,
  isStageReferenced,
  normalizePromptStages,
  validatePromptStageReferences,
} from "./prompt-modal-utils";

interface MultiStagePromptEditorProps {
  stages: PromptStage[];
  onChange: (stages: PromptStage[]) => void;
  stageContextMode: PromptStageContextMode;
  onStageContextModeChange: (mode: PromptStageContextMode) => void;
  showEnglishVersion: boolean;
}

export function MultiStagePromptEditor({
  stages,
  onChange,
  stageContextMode,
  onStageContextModeChange,
  showEnglishVersion,
}: MultiStagePromptEditorProps) {
  const { t } = useTranslation();
  const normalizedStages = normalizePromptStages(stages);
  const validationErrors = validatePromptStageReferences(normalizedStages);

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

  const insertReference = (stageIndex: number, refIndex: number) => {
    const token = `@stage${refIndex + 1}.output`;
    updateStage(stageIndex, {
      userPrompt: `${normalizedStages[stageIndex].userPrompt}${normalizedStages[stageIndex].userPrompt ? " " : ""}${token}`,
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
        return (
          <div key={stage.id} className="rounded-xl border border-border bg-background p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-foreground">
                {getStageDisplayName(stage, index)}
              </div>
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

            <input
              type="text"
              value={stage.title || ""}
              onChange={(event) => updateStage(index, { title: event.target.value })}
              placeholder={t("prompt.stageTitlePlaceholder", "阶段标题（可选）")}
              className="w-full h-9 rounded-lg border border-border bg-muted/30 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            />

            {index > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">{t("prompt.insertStageOutput", "插入输出")}</span>
                {normalizedStages.slice(0, index).map((prevStage, prevIndex) => (
                  <button
                    key={prevStage.id}
                    type="button"
                    onClick={() => insertReference(index, prevIndex)}
                    className="rounded-md border border-border bg-muted px-2 py-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                  >
                    @{prevStage.id}.output
                  </button>
                ))}
              </div>
            )}

            <Textarea
              value={stage.userPrompt}
              onChange={(event) => updateStage(index, { userPrompt: event.target.value })}
              placeholder={t("prompt.stagePromptPlaceholder", "输入该阶段的 User Prompt")}
              className="min-h-[140px]"
              enableMarkdownList
            />

            {showEnglishVersion && (
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
