import { z } from 'zod';

const promptOptimizationPromptContentSchema = z.object({
  systemPrompt: z.string().max(100000).nullable().optional(),
  userPrompt: z.string().max(100000),
});

const promptOptimizationFailureSummarySchema = z.object({
  unmetItems: z.array(z.string().max(1000)).max(3),
  cause: z.string().max(3000),
  avoidRepeatAdvice: z.string().max(3000),
});

const promptOptimizationModelSnapshotSchema = z.object({
  id: z.string().max(200).optional(),
  name: z.string().max(200).optional(),
  provider: z.string().max(200),
  model: z.string().max(500),
  apiUrl: z.string().max(5000).optional(),
});

const promptOptimizationResultSchema = z.object({
  passed: z.boolean(),
  score: z.number().int().min(0).max(100),
  confidence: z.enum(['high', 'medium', 'low']),
  assumptions: z.array(z.string().max(3000)).max(20),
  failedItems: z.array(z.object({
    requirement: z.string().max(3000),
    actual: z.string().max(10000),
    severity: z.enum(['high', 'medium', 'low']),
    evidence: z.string().max(10000).optional(),
  })).max(50),
  passedItems: z.array(z.object({
    requirement: z.string().max(3000),
    evidence: z.string().max(10000).optional(),
  })).max(50),
  analysis: z.string().max(20000),
  changeSummary: z.string().max(10000),
  nextFailureSummary: promptOptimizationFailureSummarySchema,
  optimizedPrompt: promptOptimizationPromptContentSchema,
  warnings: z.array(z.string().max(3000)).max(20),
});

const promptOptimizationIterationSchema = z.object({
  id: z.string().trim().min(1),
  index: z.number().int().positive().max(10),
  mode: z.enum(['auto', 'manual']),
  candidatePrompt: promptOptimizationPromptContentSchema,
  previousFailureSummary: promptOptimizationFailureSummarySchema.nullable().optional(),
  aModel: promptOptimizationModelSnapshotSchema,
  bModel: promptOptimizationModelSnapshotSchema,
  aOutput: z.string().max(100000).optional(),
  bResult: promptOptimizationResultSchema.optional(),
  status: z.enum(['generating', 'checking', 'passed', 'optimized', 'failed', 'error']),
  error: z.string().max(10000).optional(),
  startedAt: z.string().trim().min(1),
  completedAt: z.string().trim().min(1).optional(),
  latencyMs: z.number().int().nonnegative().optional(),
});

export const promptOptimizationSessionSchema = z.object({
  id: z.string().trim().min(1),
  promptId: z.string().trim().min(1),
  promptSnapshot: promptOptimizationPromptContentSchema.extend({
    title: z.string().max(200),
    description: z.string().max(5000).nullable().optional(),
    promptVersion: z.number().int().nonnegative().optional(),
  }),
  aModel: promptOptimizationModelSnapshotSchema,
  bModel: promptOptimizationModelSnapshotSchema,
  optimizerTemplate: z.object({
    id: z.string().max(200).optional(),
    title: z.string().max(200),
    sourcePromptId: z.string().max(200).optional(),
    strategyPrompt: z.string().max(100000),
  }),
  userCheckFocus: z.string().max(20000),
  explicitRequirements: z.array(z.string().max(3000)).max(30),
  iterations: z.array(promptOptimizationIterationSchema).max(10),
  currentCandidatePrompt: promptOptimizationPromptContentSchema,
  status: z.enum(['running', 'passed', 'stopped', 'maxed', 'error']),
  autoIterationLimit: z.number().int().positive().max(3),
  maxIterations: z.number().int().positive().max(10),
  createdAt: z.string().trim().min(1),
  updatedAt: z.string().trim().min(1),
  completedAt: z.string().trim().min(1).optional(),
});
