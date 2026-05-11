# Multi-Stage Smart Stages

## Scenario: Smart Stage Contract

### 1. Scope / Trigger

- Trigger: multi-stage prompt stages now support `type: "smart"` in addition to legacy fixed stages.
- This is a cross-layer contract: shared types, API validation, service validation, renderer form state, AI test execution, import/export, sync, and tests must all preserve the same shape.

### 2. Signatures

- Shared type: `PromptStage`
- API fields: `Prompt.stages[]`, `PromptVersion.stages[]`, `AiTestPromptSnapshot.stages[]`
- Storage: `prompts.stages` and `prompt_versions.stages` remain JSON text columns.

```ts
type PromptStageType = "fixed" | "smart";

interface PromptStageSmartConfig {
  rounds: number;
  agentModelId?: string | null;
  agentContextMode?: "inherited" | "stage_local";
  agentSystemPrompt?: string | null;
  agentUserPrompt: string;
  sourcePromptId?: string | null;
  sourcePromptTitle?: string | null;
}

interface PromptStage {
  id: string;
  type?: PromptStageType;
  title?: string | null;
  userPrompt: string;
  userPromptEn?: string | null;
  smartConfig?: PromptStageSmartConfig | null;
}
```

### 3. Contracts

- Missing `type` means `"fixed"` for backward compatibility.
- Fixed stage:
  - `userPrompt` is required by service validation.
  - `smartConfig` should be ignored or normalized to `null`.
- Smart stage:
  - `smartConfig.rounds` must be an integer from 1 to 10.
  - `smartConfig.agentModelId` is required for saved prompts.
  - Missing `smartConfig.agentContextMode` means `"inherited"` for backward compatibility and UI defaults.
  - `smartConfig.agentUserPrompt` is required.
  - `userPrompt` may be empty because the stage input is generated at runtime.
- Smart-stage agent context is controlled by `smartConfig.agentContextMode` and only applies to the smart-stage agent model:
  - `inherited`: the agent receives this smart stage's internal agent user/assistant history from previous rounds.
  - `stage_local`: the agent receives only the current round user prompt, with no additional agent history.
  - Neither mode gives the agent the full main-flow transcript by default.
- Smart-stage round input semantics:
  - Round 0 agent user prompt is rendered from `smartConfig.agentUserPrompt`, including explicit `@stageN.*` substitutions.
  - Round 1+ agent user prompt is the previous main-flow assistant output from the same smart stage.
  - The agent output becomes the main-flow user input for that round.
  - The main-flow assistant output is stored as that round's smart-stage output.
- The main flow model still follows the prompt-level `stageContextMode`; this context restriction is specifically for the smart-stage agent model.
- Selecting a managed Prompt for a smart stage copies a snapshot into `agentSystemPrompt` and `agentUserPrompt`; runtime does not follow source Prompt edits.
- Reference syntax:
  - `@stageN.output` resolves to the last output for the referenced stage.
  - `@stageN.input` resolves to the last generated input for the referenced smart stage.
  - `@stageN.input[i]` and `@stageN.output[i]` use zero-based round indexes.

### 4. Validation & Error Matrix

- Multi-stage prompt with fewer than 2 or more than 10 stages -> 422.
- Multi-stage prompt on a non-text prompt -> 422.
- Fixed stage with empty `userPrompt` -> 422.
- Smart stage with missing `agentModelId` -> 422.
- Smart stage with empty `agentUserPrompt` -> 422.
- Smart stage with `rounds < 1` or `rounds > 10` -> 422.
- Any stage reference to the same or a later stage -> 422.
- Any stage reference to a missing stage -> 422.

### 5. Good/Base/Bad Cases

- Good: `stage2` is smart, reads `@stage1.output`, runs three rounds, and downstream `stage3` can reference `@stage2.input[2]` or `@stage2.output`.
- Base: existing stages without `type` continue to save, render, and execute as fixed stages.
- Bad: a smart stage saved with only `userPrompt` and no `smartConfig.agentUserPrompt`; this should fail validation instead of silently executing as an empty agent.
- Bad: passing the full inherited main transcript into the smart-stage agent; this pollutes the agent decision context and breaks the explicit agent context contract.

### 6. Tests Required

- Unit: stage normalization preserves smart config and legacy fixed defaults.
- Unit: reference replacement resolves `input/output` indexed and unindexed forms.
- Unit: validation checks smart-stage agent prompt references, including invalid forward references.
- Route/service: prompt create/update persists smart stage config and rejects invalid references.
- Regression: existing fixed multi-stage prompt tests continue passing.

### 7. Wrong vs Correct

#### Wrong

```ts
const output = stageOutputs["@stage2.output"];
```

This assumes a single output string per stage and cannot represent smart-stage rounds.

#### Correct

```ts
const stageValues = {
  stage2: {
    input: ["麻婆豆腐", "麻辣肉片", "C"],
    output: ["请选择...", "请选择...", "选择结束"],
  },
};
```

Store stage reference values as per-stage input/output arrays. Unindexed references resolve to the last array item.

#### Wrong

```ts
const agentContext = conversationMessages;
```

This gives the smart-stage agent the entire inherited transcript.

#### Correct

```ts
const agentContext =
  smartConfig.agentContextMode === "inherited"
    ? agentConversationMessages
    : [];
```

The smart-stage agent either sees only its own internal agent conversation from earlier rounds or just the current round user prompt. It does not receive the main-flow transcript unless a separate future option explicitly adds that behavior.
