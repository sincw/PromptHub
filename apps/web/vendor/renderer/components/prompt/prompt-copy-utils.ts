import type { Prompt, PromptStage } from "@prompthub/shared/types";
import {
  formatMultiStagePromptTemplate,
  isMultiStagePrompt,
  normalizePromptStages,
} from "./prompt-modal-utils";

const VARIABLE_REGEX = /\{\{([^}:]+)(?::([^}]*))?\}\}/g;
const SYSTEM_VARIABLES = new Set([
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_DATETIME",
  "CURRENT_YEAR",
  "CURRENT_MONTH",
  "CURRENT_DAY",
  "CURRENT_WEEKDAY",
]);

export interface ResolvedPromptContent {
  systemPrompt?: string;
  userPrompt: string;
  stages?: PromptStage[];
}

export function resolvePromptContentByLanguage(
  prompt: Prompt,
  showEnglish: boolean,
): ResolvedPromptContent {
  if (isMultiStagePrompt(prompt)) {
    const stages = normalizePromptStages(prompt.stages).map((stage) => ({
      ...stage,
      userPrompt: showEnglish && stage.userPromptEn ? stage.userPromptEn : stage.userPrompt,
    }));

    return {
      systemPrompt: (showEnglish
        ? (prompt.systemPromptEn || prompt.systemPrompt)
        : prompt.systemPrompt) ?? undefined,
      userPrompt: formatMultiStagePromptTemplate(stages, "main"),
      stages,
    };
  }

  return {
    systemPrompt: (showEnglish
      ? (prompt.systemPromptEn || prompt.systemPrompt)
      : prompt.systemPrompt) ?? undefined,
    userPrompt: showEnglish
      ? (prompt.userPromptEn || prompt.userPrompt)
      : prompt.userPrompt,
  };
}

export function hasUserDefinedPromptVariables(
  systemPrompt?: string,
  userPrompt?: string,
  stages?: PromptStage[],
): boolean {
  const stageText = stages?.map((stage) => `${stage.userPrompt}\n${stage.userPromptEn || ""}`).join("\n") || "";
  const combined = `${systemPrompt || ""}\n${userPrompt || ""}\n${stageText}`;
  const matches = [...combined.matchAll(VARIABLE_REGEX)];
  return matches.some((match) => !SYSTEM_VARIABLES.has(match[1].trim()));
}

export function buildPromptCopyText({
  systemPrompt,
  userPrompt,
}: ResolvedPromptContent): string {
  if (!systemPrompt) {
    return userPrompt;
  }

  return `[System]\n${systemPrompt}\n\n[User]\n${userPrompt}`;
}
