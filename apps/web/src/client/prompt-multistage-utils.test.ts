import { describe, expect, it } from 'vitest';
import type { Prompt } from '@prompthub/shared';
import {
  buildPromptPayload,
  createPromptFormData,
  formatMultiStagePromptTemplate,
  isMultiStagePrompt,
  replaceStageReferences,
  validatePromptStageReferences,
  normalizeSmartStageConfig,
} from '../../vendor/renderer/components/prompt/prompt-modal-utils';
import {
  hasUserDefinedPromptVariables,
  resolvePromptContentByLanguage,
} from '../../vendor/renderer/components/prompt/prompt-copy-utils';

describe('multi-stage prompt utilities', () => {
  it('validates only earlier stage output references', () => {
    expect(validatePromptStageReferences([
      { id: 'stage1', userPrompt: 'Find a date' },
      { id: 'stage2', userPrompt: 'Use @stage1.output' },
      { id: 'stage3', userPrompt: 'Use @stage2.output and @stage4.output' },
    ])).toEqual(['Stage 3 references a missing stage: @stage4.output']);

    expect(validatePromptStageReferences([
      { id: 'stage1', userPrompt: 'Self @stage1.output' },
      { id: 'stage2', userPrompt: 'Done' },
    ])).toEqual(['Stage 1 can only reference earlier stages: @stage1.output']);
  });

  it('formats and resolves multi-stage prompt content for copy and variable filling', () => {
    const prompt = {
      id: 'prompt-1',
      title: 'Trip Planner',
      executionMode: 'multi_stage',
      userPrompt: 'compatibility text',
      stages: [
        { id: 'stage1', title: 'Date', userPrompt: 'What date is {{day}}?' },
        { id: 'stage2', title: 'Weather', userPrompt: 'Weather for @stage1.output', userPromptEn: 'Weather for @stage1.output in {{city}}' },
      ],
      variables: [],
      tags: [],
      images: [],
      videos: [],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
      createdAt: '2026-05-09T00:00:00.000Z',
      updatedAt: '2026-05-09T00:00:00.000Z',
    } satisfies Prompt;

    const resolved = resolvePromptContentByLanguage(prompt, true);

    expect(resolved.userPrompt).toContain('[Stage 1: Date]');
    expect(resolved.userPrompt).toContain('Weather for @stage1.output in {{city}}');
    expect(resolved.stages?.[1]?.userPrompt).toBe('Weather for @stage1.output in {{city}}');
    expect(hasUserDefinedPromptVariables(resolved.systemPrompt, resolved.userPrompt, resolved.stages)).toBe(true);
  });

  it('stores formatted compatibility text while keeping structured stages as execution source', () => {
    const payload = buildPromptPayload({
      title: 'Pipeline',
      description: '',
      promptType: 'text',
      executionMode: 'multi_stage',
      stageContextMode: 'inherited',
      stages: [
        { id: 'stage1', title: 'First', userPrompt: 'A' },
        { id: 'stage2', title: 'Second', userPrompt: '@stage1.output B' },
      ],
      systemPrompt: '',
      systemPromptEn: '',
      userPrompt: 'single',
      userPromptEn: '',
      tags: [],
      images: [],
      videos: [],
      source: '',
      notes: '',
    });

    expect(payload.executionMode).toBe('multi_stage');
    expect(payload.stageContextMode).toBe('inherited');
    expect(payload.stages).toHaveLength(2);
    expect(payload.userPrompt).toBe(formatMultiStagePromptTemplate(payload.stages, 'main'));
  });

  it('infers multi-stage edit mode from stored stages and omits empty stages for single-stage payloads', () => {
    const form = createPromptFormData({
      title: 'Legacy Multi Stage',
      executionMode: 'single',
      userPrompt: 'compatibility',
      stages: [
        { id: 'stage1', userPrompt: 'A' },
        { id: 'stage2', userPrompt: '@stage1.output B' },
      ],
    });

    expect(form.executionMode).toBe('multi_stage');
    expect(isMultiStagePrompt({ executionMode: 'single', stages: form.stages })).toBe(true);

    const payload = buildPromptPayload({
      title: 'Single Stage',
      description: '',
      promptType: 'text',
      executionMode: 'single',
      stageContextMode: 'isolated',
      stages: [],
      systemPrompt: '',
      systemPromptEn: '',
      userPrompt: 'Hello',
      userPromptEn: '',
      tags: [],
      images: [],
      videos: [],
      source: '',
      notes: '',
    });

    expect(payload.executionMode).toBe('single');
    expect(payload).not.toHaveProperty('stages');
  });

  it('preserves smart stage config and formats compatibility content', () => {
    const payload = buildPromptPayload({
      title: 'Smart Pipeline',
      description: '',
      promptType: 'text',
      executionMode: 'multi_stage',
      stageContextMode: 'inherited',
      stages: [
        { id: 'stage1', type: 'fixed', title: 'Menu', userPrompt: '请选择一个菜' },
        {
          id: 'stage2',
          type: 'smart',
          title: 'Auto Choice',
          userPrompt: '',
          smartConfig: {
            rounds: 3,
            agentModelId: 'agent-model-1',
            agentContextMode: 'stage_local',
            agentSystemPrompt: '你是川菜大师',
            agentUserPrompt: '根据 @stage1.output 选择',
            sourcePromptId: 'prompt-agent',
            sourcePromptTitle: '川菜选择器',
          },
        },
      ],
      systemPrompt: '',
      systemPromptEn: '',
      userPrompt: 'single',
      userPromptEn: '',
      tags: [],
      images: [],
      videos: [],
      source: '',
      notes: '',
    });

    expect(payload.executionMode).toBe('multi_stage');
    expect(payload.stages?.[1]?.type).toBe('smart');
    expect(payload.stages?.[1]?.smartConfig?.rounds).toBe(3);
    expect(payload.stages?.[1]?.smartConfig?.agentContextMode).toBe('stage_local');
    expect(payload.stages?.[1]?.smartConfig?.agentUserPrompt).toContain('@stage1.output');
    expect(payload.userPrompt).toContain('[Smart Stage: rounds=3]');
    expect(payload.userPrompt).toContain('[Agent System]');
  });

  it('defaults smart stage agent context to inherited', () => {
    expect(normalizeSmartStageConfig(null).agentContextMode).toBe('inherited');
    expect(normalizeSmartStageConfig({ rounds: 1, agentUserPrompt: 'Choose' }).agentContextMode).toBe('inherited');
  });

  it('resolves smart stage input and output references with zero-based indexes', () => {
    const values = {
      stage2: {
        input: ['麻婆豆腐', '麻辣肉片', 'C'],
        output: [
          '请选择：凉拌鱼皮，蒸糕，麻辣肉片',
          '请选择：A，B，C',
          '选择结束',
        ],
      },
    };

    expect(replaceStageReferences('@stage2.input', values)).toBe('C');
    expect(replaceStageReferences('@stage2.output', values)).toBe('选择结束');
    expect(replaceStageReferences('@stage2.input[0]', values)).toBe('麻婆豆腐');
    expect(replaceStageReferences('@stage2.output[1]', values)).toBe('请选择：A，B，C');
    expect(replaceStageReferences('@stage2.output[9]', values)).toBe('@stage2.output[9]');
  });

  it('validates smart stage references from agent prompts', () => {
    expect(validatePromptStageReferences([
      { id: 'stage1', userPrompt: 'A' },
      {
        id: 'stage2',
        type: 'smart',
        userPrompt: '',
        smartConfig: {
          rounds: 1,
          agentModelId: 'agent-model',
          agentSystemPrompt: 'Use @stage3.output',
          agentUserPrompt: 'Choose from @stage1.output',
        },
      },
      { id: 'stage3', userPrompt: '@stage2.input[0]' },
    ])).toEqual(['Stage 2 can only reference earlier stages: @stage3.output']);
  });
});
