import { mediaScanOperator } from './mediaScanOperator.js';
import { audioBeatSyncOperator } from './audioBeatSyncOperator.js';
import { scriptStoryboardOperator } from './scriptStoryboardOperator.js';
import { semanticClipMatchOperator } from './semanticClipMatchOperator.js';
import { jianyingDraftOperator } from './jianyingDraftOperator.js';
import { aigcImageGenOperator } from './aigcImageGenOperator.js';
import { ttsVoiceoverOperator } from './ttsVoiceoverOperator.js';
import { motionSceneOperator } from './motionSceneOperator.js';
import { cosyvoiceTtsOperator } from './cosyvoiceTtsOperator.js';
import { remotionRenderOperator } from './remotionRenderOperator.js';

export const OPERATORS = [
  mediaScanOperator,
  audioBeatSyncOperator,
  scriptStoryboardOperator,
  semanticClipMatchOperator,
  jianyingDraftOperator,
  aigcImageGenOperator,
  ttsVoiceoverOperator,
  motionSceneOperator,
  cosyvoiceTtsOperator,
  remotionRenderOperator
];

const OPERATOR_MAP = new Map();

for (const op of OPERATORS) {
  OPERATOR_MAP.set(op.id, op);
  if (Array.isArray(op.aliases)) {
    for (const alias of op.aliases) {
      OPERATOR_MAP.set(alias, op);
    }
  }
}

/**
 * Get an operator by ID or alias
 */
export function getOperator(idOrAlias) {
  if (!idOrAlias) return null;
  return OPERATOR_MAP.get(idOrAlias) || null;
}

/**
 * Resolve operator for a given stage
 */
export function resolveOperatorForStage(stage) {
  if (!stage) return null;
  if (stage.operatorId && OPERATOR_MAP.has(stage.operatorId)) {
    return OPERATOR_MAP.get(stage.operatorId);
  }
  if (stage.id && OPERATOR_MAP.has(stage.id)) {
    return OPERATOR_MAP.get(stage.id);
  }
  return null;
}

/**
 * List all available operators
 */
export function listAllOperators() {
  return OPERATORS.map(op => ({
    id: op.id,
    name: op.name,
    description: op.description,
    agentId: op.agentId,
    agentName: op.agentName,
    skillId: op.skillId,
    inputs: op.inputs,
    outputs: op.outputs
  }));
}
