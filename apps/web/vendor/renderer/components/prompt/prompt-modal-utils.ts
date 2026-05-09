import type {
  CreatePromptDTO,
  Prompt,
  PromptExecutionMode,
  PromptStage,
  PromptStageContextMode,
  PromptType,
  UpdatePromptDTO,
} from "@prompthub/shared/types";

export interface PromptFormData {
  title: string;
  description: string;
  promptType: PromptType;
  executionMode: PromptExecutionMode;
  stageContextMode: PromptStageContextMode;
  stages: PromptStage[];
  systemPrompt: string;
  systemPromptEn: string;
  userPrompt: string;
  userPromptEn: string;
  tags: string[];
  folderId?: string;
  images: string[];
  videos: string[];
  source: string;
  notes: string;
}

export interface PromptBilingualFields {
  systemPrompt: string;
  systemPromptEn: string;
  userPrompt: string;
  userPromptEn: string;
}

export const MULTI_STAGE_MIN_STAGE_COUNT = 2;
export const MULTI_STAGE_MAX_STAGE_COUNT = 10;
export const STAGE_OUTPUT_REFERENCE_REGEX = /@stage(\d+)\.output/g;

export function createPromptStage(index: number): PromptStage {
  return {
    id: `stage${index}`,
    title: "",
    userPrompt: "",
    userPromptEn: "",
  };
}

export function createDefaultPromptStages(): PromptStage[] {
  return [
    createPromptStage(1),
    createPromptStage(2),
  ];
}

export function normalizePromptStages(
  stages: PromptStage[] | undefined,
): PromptStage[] {
  const source =
    stages && stages.length >= MULTI_STAGE_MIN_STAGE_COUNT
      ? stages
      : createDefaultPromptStages();

  return source
    .slice(0, MULTI_STAGE_MAX_STAGE_COUNT)
    .map((stage, index) => ({
      id: `stage${index + 1}`,
      title: stage.title || "",
      userPrompt: stage.userPrompt || "",
      userPromptEn: stage.userPromptEn || "",
    }));
}

export function isMultiStagePrompt(prompt?: Partial<Prompt> | null): boolean {
  return prompt?.executionMode === "multi_stage";
}

export function getStageDisplayName(stage: PromptStage, index: number): string {
  const fallback = `Stage ${index + 1}`;
  const title = (stage.title || "").trim();
  return title ? `${fallback}: ${title}` : fallback;
}

export function formatMultiStagePromptTemplate(
  stages: PromptStage[] | undefined,
  language: "main" | "en" = "main",
): string {
  return normalizePromptStages(stages)
    .map((stage, index) => {
      const content =
        language === "en" && stage.userPromptEn
          ? stage.userPromptEn
          : stage.userPrompt;
      return `[${getStageDisplayName(stage, index)}]\n${content || ""}`.trimEnd();
    })
    .join("\n\n");
}

export function validatePromptStageReferences(stages: PromptStage[]): string[] {
  const errors: string[] = [];
  const normalized = normalizePromptStages(stages);

  normalized.forEach((stage, index) => {
    const texts = [stage.userPrompt, stage.userPromptEn || ""];
    for (const text of texts) {
      for (const match of text.matchAll(STAGE_OUTPUT_REFERENCE_REGEX)) {
        const refIndex = Number(match[1]) - 1;
        if (refIndex < 0 || refIndex >= normalized.length) {
          errors.push(`Stage ${index + 1} references a missing stage: ${match[0]}`);
        } else if (refIndex >= index) {
          errors.push(`Stage ${index + 1} can only reference earlier stages: ${match[0]}`);
        }
      }
    }
  });

  return errors;
}

export function isStageReferenced(
  stages: PromptStage[],
  targetStageIndex: number,
): boolean {
  const token = `@stage${targetStageIndex + 1}.output`;
  return stages.some((stage, index) => {
    if (index <= targetStageIndex) return false;
    return stage.userPrompt.includes(token) || (stage.userPromptEn || "").includes(token);
  });
}

export function createPromptFormData(
  source?: Partial<Prompt> | Partial<CreatePromptDTO> | null,
  defaults?: Partial<PromptFormData>,
): PromptFormData {
  return {
    title: source?.title || defaults?.title || "",
    description: source?.description || defaults?.description || "",
    promptType:
      source?.promptType || defaults?.promptType || ("text" as PromptType),
    executionMode:
      source?.executionMode || defaults?.executionMode || ("single" as PromptExecutionMode),
    stageContextMode:
      source?.stageContextMode || defaults?.stageContextMode || ("isolated" as PromptStageContextMode),
    stages: normalizePromptStages(source?.stages || defaults?.stages),
    systemPrompt: source?.systemPrompt || defaults?.systemPrompt || "",
    systemPromptEn: source?.systemPromptEn || defaults?.systemPromptEn || "",
    userPrompt: source?.userPrompt || defaults?.userPrompt || "",
    userPromptEn: source?.userPromptEn || defaults?.userPromptEn || "",
    tags: source?.tags ? [...source.tags] : [...(defaults?.tags || [])],
    folderId: source?.folderId ?? defaults?.folderId,
    images: source?.images ? [...source.images] : [...(defaults?.images || [])],
    videos: source?.videos ? [...source.videos] : [...(defaults?.videos || [])],
    source: source?.source || defaults?.source || "",
    notes: source?.notes || defaults?.notes || "",
  };
}

export function buildPromptPayload(
  form: PromptFormData,
): CreatePromptDTO | UpdatePromptDTO {
  const isMultiStage = form.promptType === "text" && form.executionMode === "multi_stage";
  const stages = isMultiStage ? normalizePromptStages(form.stages) : [];
  const userPrompt = isMultiStage
    ? formatMultiStagePromptTemplate(stages, "main")
    : form.userPrompt.trim();
  const userPromptEn = isMultiStage
    ? formatMultiStagePromptTemplate(stages, "en").trim() || undefined
    : form.userPromptEn.trim() || undefined;

  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    promptType: form.promptType,
    executionMode: isMultiStage ? "multi_stage" : "single",
    stageContextMode: form.stageContextMode,
    stages,
    systemPrompt: form.systemPrompt.trim() || undefined,
    systemPromptEn: form.systemPromptEn.trim() || undefined,
    userPrompt,
    userPromptEn,
    tags: [...form.tags],
    images: [...form.images],
    videos: [...form.videos],
    folderId: form.folderId || undefined,
    source: form.source.trim() || undefined,
    notes: form.notes.trim() || undefined,
  };
}

export function hasPromptFormChanges(
  form: PromptFormData,
  baseline?: Partial<Prompt> | Partial<CreatePromptDTO> | null,
): boolean {
  const initial = createPromptFormData(baseline);

  return (
    form.title !== initial.title ||
    form.description !== initial.description ||
    form.promptType !== initial.promptType ||
    form.executionMode !== initial.executionMode ||
    form.stageContextMode !== initial.stageContextMode ||
    JSON.stringify(form.stages) !== JSON.stringify(initial.stages) ||
    form.systemPrompt !== initial.systemPrompt ||
    form.systemPromptEn !== initial.systemPromptEn ||
    form.userPrompt !== initial.userPrompt ||
    form.userPromptEn !== initial.userPromptEn ||
    JSON.stringify(form.tags) !== JSON.stringify(initial.tags) ||
    JSON.stringify(form.images) !== JSON.stringify(initial.images) ||
    JSON.stringify(form.videos) !== JSON.stringify(initial.videos) ||
    (form.folderId || undefined) !== (initial.folderId || undefined) ||
    form.source !== initial.source ||
    form.notes !== initial.notes
  );
}

export function getExistingPromptTags(prompts: Prompt[]): string[] {
  return [...new Set(prompts.flatMap((prompt) => prompt.tags))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function promoteMainEnglishToEnglishVersion(
  fields: PromptBilingualFields,
): PromptBilingualFields {
  const hasEnglishVersion = !!(fields.systemPromptEn || fields.userPromptEn);
  const combinedMain = [fields.systemPrompt, fields.userPrompt]
    .filter(Boolean)
    .join(" ");

  if (hasEnglishVersion || !isPureEnglish(combinedMain)) {
    return fields;
  }

  return {
    systemPrompt: "",
    userPrompt: "",
    systemPromptEn: fields.systemPrompt,
    userPromptEn: fields.userPrompt,
  };
}

export function isPureEnglish(text: string): boolean {
  if (!text || text.trim().length < 10) return false;

  const cleaned = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]*`/g, "")
    .replace(/\{\{[^}]*\}\}/g, "")
    .replace(/https?:\/\/\S+/g, "");

  const cjkPattern =
    /[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/;
  if (cjkPattern.test(cleaned)) return false;

  const latinOnly = cleaned.replace(/[^a-zA-Z]/g, "");
  return latinOnly.length >= 10;
}

export function getLanguageName(langCode: string): string {
  const lang = langCode.toLowerCase();
  if (lang.startsWith("zh")) return "Chinese";
  if (lang.startsWith("ja")) return "Japanese";
  if (lang.startsWith("de")) return "German";
  if (lang.startsWith("fr")) return "French";
  if (lang.startsWith("es")) return "Spanish";
  if (lang.startsWith("ko")) return "Korean";
  if (lang.startsWith("pt")) return "Portuguese";
  if (lang.startsWith("ru")) return "Russian";
  if (lang.startsWith("it")) return "Italian";
  return "the target language";
}
