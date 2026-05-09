import { describe, expect, it } from 'vitest';
import type { Prompt } from '@prompthub/shared';
import {
  buildPromptPayload,
  createPromptFormData,
  formatMultiStagePromptTemplate,
  validatePromptStageReferences,
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
      userPrompt: 'compatibility',
      stages: [
        { id: 'stage1', userPrompt: 'A' },
        { id: 'stage2', userPrompt: '@stage1.output B' },
      ],
    });

    expect(form.executionMode).toBe('multi_stage');

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
});
