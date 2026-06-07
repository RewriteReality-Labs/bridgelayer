/**
 * BridgeLayer — public API entry point
 *
 * Three systems. Three functions. One bridge.
 *
 *   extractClaims()    Parse phase input → Claim[] for GBSE
 *   triggerGate()      Run GBSE on a Claim → GateResult
 *   stampBlueprint()   Map GateResults → StampedBlueprint + BuildVerdict
 *
 * For full ATTA governance, use BridgeLayer class directly.
 *
 * NOTE: runPipeline() is imported from the GBSE pipeline (src/index.js).
 * That file must expose stagnated + stagnationTags in its return object.
 * See KNOWLEDGE_BASE.md §3.2 — src/index.js prerequisite fix.
 */

// Core three-function API
export { extractClaims, triggerGate, stampBlueprint, BridgeLayer } from './bridge';

// Dependency injection interfaces — implement these to connect real systems
export type { GbsePipeline, AttaStore, DecisionLogSink } from './bridge';

// All types
export type {
  Claim,
  ClaimDomain,
  StakesLevel,
  DecisionRelevance,
  PipelineResult,
  GateResult,
  GateSignal,
  GateDecision,
  GateDecisionLog,
  AttaRecord,
  AttaStatus,
  StampedBlueprint,
  BlueprintGrade,
  BuildVerdict,
} from './types';

// Constants
export {
  TOKEN_BUDGET,
  DOMAIN_TO_FIELD,
  BLOCKING_FIELDS,
  ATTA_BLOCKING_STATUSES,
  ATTA_CHECK_REQUIRED_STAKES,
} from './constants';

// Utilities — exported for use in callers and tests
export {
  normaliseCorrectionLog,
  extractHallucinationLines,
  extractDebatableLines,
} from './utils';
