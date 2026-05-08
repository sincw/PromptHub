/**
 * Core Prompt type definitions
 * Prompt 核心类型定义
 */

// Prompt 类型：文本对话 / 图片生成 / 视频生成
export type PromptType = "text" | "image" | "video";
export type ResourceVisibility = 'private' | 'shared';

export interface AiTestSessionMessage {
  id: string;
  role: "system" | "user" | "assistant";
  content: string;
  thinkingContent?: string | null;
  createdAt: string;
}

export interface AiTestPromptSnapshot {
  title: string;
  systemPrompt?: string | null;
  userPrompt: string;
  promptVersion?: number;
}

export interface AiTestSession {
  id: string;
  promptSnapshot: AiTestPromptSnapshot;
  model: {
    provider: string;
    model: string;
    apiUrl?: string;
  };
  messages: AiTestSessionMessage[];
  status: "completed";
  lastLatencyMs?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PromptOptimizationPromptContent {
  systemPrompt?: string | null;
  userPrompt: string;
}

export interface PromptOptimizationPromptSnapshot
  extends PromptOptimizationPromptContent {
  title: string;
  description?: string | null;
  promptVersion?: number;
}

export interface PromptOptimizationModelSnapshot {
  id?: string;
  name?: string;
  provider: string;
  model: string;
  apiUrl?: string;
}

export interface PromptOptimizerTemplateSnapshot {
  id?: string;
  title: string;
  sourcePromptId?: string;
  strategyPrompt: string;
}

export interface PromptOptimizationFailureSummary {
  unmetItems: string[];
  cause: string;
  avoidRepeatAdvice: string;
}

export interface PromptOptimizationFailedItem {
  requirement: string;
  actual: string;
  severity: "high" | "medium" | "low";
  evidence?: string;
}

export interface PromptOptimizationPassedItem {
  requirement: string;
  evidence?: string;
}

export interface PromptOptimizationResult {
  passed: boolean;
  score: number;
  confidence: "high" | "medium" | "low";
  assumptions: string[];
  failedItems: PromptOptimizationFailedItem[];
  passedItems: PromptOptimizationPassedItem[];
  analysis: string;
  changeSummary: string;
  nextFailureSummary: PromptOptimizationFailureSummary;
  optimizedPrompt: PromptOptimizationPromptContent;
  warnings: string[];
}

export type PromptOptimizationIterationMode = "auto" | "manual";

export type PromptOptimizationIterationStatus =
  | "generating"
  | "checking"
  | "passed"
  | "optimized"
  | "failed"
  | "error";

export interface PromptOptimizationIteration {
  id: string;
  index: number;
  mode: PromptOptimizationIterationMode;
  candidatePrompt: PromptOptimizationPromptContent;
  previousFailureSummary?: PromptOptimizationFailureSummary | null;
  aModel: PromptOptimizationModelSnapshot;
  bModel: PromptOptimizationModelSnapshot;
  aOutput?: string;
  bResult?: PromptOptimizationResult;
  status: PromptOptimizationIterationStatus;
  error?: string;
  startedAt: string;
  completedAt?: string;
  latencyMs?: number;
}

export type PromptOptimizationSessionStatus =
  | "running"
  | "passed"
  | "stopped"
  | "maxed"
  | "error";

export interface PromptOptimizationSession {
  id: string;
  promptId: string;
  promptSnapshot: PromptOptimizationPromptSnapshot;
  aModel: PromptOptimizationModelSnapshot;
  bModel: PromptOptimizationModelSnapshot;
  optimizerTemplate: PromptOptimizerTemplateSnapshot;
  userCheckFocus: string;
  explicitRequirements: string[];
  iterations: PromptOptimizationIteration[];
  currentCandidatePrompt: PromptOptimizationPromptContent;
  status: PromptOptimizationSessionStatus;
  autoIterationLimit: number;
  maxIterations: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Prompt {
  id: string;
  ownerUserId?: string | null;
  visibility?: ResourceVisibility;
  title: string;
  description?: string | null;
  promptType?: PromptType; // Prompt 类型，默认 text
  systemPrompt?: string | null;
  systemPromptEn?: string | null; // English System Prompt / 英文版 System Prompt
  userPrompt: string;
  userPromptEn?: string | null; // English User Prompt / 英文版 User Prompt
  variables: Variable[];
  tags: string[];
  folderId?: string | null;
  images?: string[];
  videos?: string[]; // Video file names for preview / 视频预览文件名
  isFavorite: boolean;
  isPinned: boolean; // Pinned / 置顶
  version: number;
  currentVersion: number;
  usageCount: number;
  source?: string | null; // 来源 / Source URL or reference
  notes?: string | null; // 备注 / Personal notes about the prompt
  lastAiResponse?: string | null; // Last AI test response / 最后一次 AI 测试的响应
  aiTestSessions?: AiTestSession[]; // Persistent AI test conversation sessions / 持久化 AI 测试对话会话
  promptOptimizationSessions?: PromptOptimizationSession[]; // Prompt optimization session history / 提示词优化会话历史
  createdAt: string; // ISO 8601 format / ISO 8601 格式
  updatedAt: string; // ISO 8601 format / ISO 8601 格式
}

export interface Variable {
  name: string;
  type: VariableType;
  label?: string;
  defaultValue?: string;
  options?: string[]; // for select type
  required: boolean;
}

export type VariableType = "text" | "textarea" | "number" | "select";

export interface PromptVersion {
  id: string;
  promptId: string;
  version: number;
  systemPrompt?: string | null;
  systemPromptEn?: string | null;
  userPrompt: string;
  userPromptEn?: string | null;
  variables: Variable[];
  note?: string | null;
  aiResponse?: string | null; // AI test response for this version / 该版本的 AI 测试响应
  createdAt: string; // ISO 8601 format / ISO 8601 格式
}

// DTO Types
export interface CreatePromptDTO {
  visibility?: ResourceVisibility;
  title: string;
  description?: string;
  promptType?: PromptType;
  systemPrompt?: string;
  systemPromptEn?: string;
  userPrompt: string;
  userPromptEn?: string;
  variables?: Variable[];
  tags?: string[];
  folderId?: string;
  images?: string[];
  videos?: string[];
  source?: string;
  notes?: string;
}

export interface UpdatePromptDTO {
  visibility?: ResourceVisibility;
  title?: string;
  description?: string;
  promptType?: PromptType;
  systemPrompt?: string;
  systemPromptEn?: string;
  userPrompt?: string;
  userPromptEn?: string;
  variables?: Variable[];
  tags?: string[];
  folderId?: string;
  images?: string[];
  videos?: string[];
  isFavorite?: boolean;
  isPinned?: boolean;
  usageCount?: number;
  source?: string;
  notes?: string;
  lastAiResponse?: string;
  aiTestSessions?: AiTestSession[];
  promptOptimizationSessions?: PromptOptimizationSession[];
}

export interface SearchQuery {
  scope?: 'private' | 'shared' | 'all';
  keyword?: string;
  tags?: string[];
  folderId?: string;
  isFavorite?: boolean;
  sortBy?: "title" | "createdAt" | "updatedAt" | "usageCount";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
}
