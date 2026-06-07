/**
 * bridge/types.ts
 * ─────────────────────────────────────────────────────────────
 * Canonical type definitions for the BridgeLayer system.
 * Three systems share these types — do not duplicate or fork.
 *
 *   GBSE       — verification pipeline (produces PipelineResult)
 *   BuildGate  — go/no-go decision gate (consumes GateSignal)
 *   ATTA       — proof governance (produces AttaRecord)
 *
 * Master claim: GBSE_BUILDGATE_BRIDGELAYER_MASTER_CLAIM_001
 * GBSE audit:   GBSE_BRIDGELAYER_REPO_CLAIM_001 (CONDITIONAL_PASS 83/100)
 * RewriteReality Labs | 2026-06-07
 * ─────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────
// CLAIM TYPES
// ─────────────────────────────────────────────────────────────

/** Six active claim domains — each routes to a Blueprint field via DOMAIN_TO_FIELD. */
export type ClaimDomain =
  | 'market_sizing'
  | 'pain_validation'
  | 'competitor_analysis'
  | 'technical_specs'
  | 'pricing'
  | 'user_behaviour';

/** Stake level determines the GBSE token budget for this claim. */
export type StakesLevel = 'HIGH' | 'MED' | 'LOW';

/** BLOCKING claims must verify before BuildGate can fire ALLOW. */
export type DecisionRelevance = 'BLOCKING' | 'CONTEXTUAL';

/**
 * A single verifiable claim extracted from a BuildGate phase input.
 *
 * Migration note: `claim` is the legacy field. New code must use `statement`.
 * Both are accepted by normaliseClaim(). `claim` will be removed in a future release.
 */
export interface Claim {
  /** Unique claim identifier — used as trace anchor in GateDecisionLog. */
  claimId: string;

  /**
   * Canonical claim text.
   * Use this field in all new code.
   */
  statement: string;

  /**
   * Backward-compatible alias for statement.
   * @deprecated Use statement. Will be removed in next major version.
   */
  claim?: string;

  domain: ClaimDomain;
  stakes_level: StakesLevel;
  decision_relevance: DecisionRelevance;

  /**
   * Explicit blocking flag.
   * Derived from decision_relevance if not provided.
   * Must be explicit for audit trail clarity.
   */
  blocking: boolean;

  /** BuildGate phase this claim originated from (1–6). */
  source_phase?: number;

  /** Raw text slice from the phase input that produced this claim. */
  source_text?: string;
}

// ─────────────────────────────────────────────────────────────
// RAW BLUEPRINT — emitted by BuildGate Phase 6
// BridgeLayer reads this. BridgeLayer never writes it.
// Distinct from StampedBlueprint which BridgeLayer produces.
// ─────────────────────────────────────────────────────────────

export interface BlueprintNode {
  name: string;
  function: string;
  data_required: string[];
  pass_condition: string;
  fail_condition: string;
}

/**
 * RawBlueprint — the structured artifact emitted by BuildGate Phase 6.
 *
 * BridgeLayer.extractClaims() consumes this.
 * BridgeLayer.stampBlueprint() produces a StampedBlueprint from it.
 * These are two distinct objects at two distinct pipeline stages.
 */
export interface RawBlueprint {
  blueprint_id:  string;
  intent: {
    raw_input:          string;
    problem_statement:  string;
  };
  path: {
    chosen:    string;
    eliminated: string[];
  };
  market: {
    primary:                 string;
    first_payer:             string;
    year_one_revenue_usd:    number;
    distribution:            string;
    primary_risk:            string;
    validation_signal?:      string;
  };
  scope: {
    node_1: BlueprintNode;
    node_2: BlueprintNode;
    node_3: BlueprintNode;
  };
  roadmap: {
    weeks:            any[];
    team:             string[];
    total_cost_usd:   number;
    revenue_trigger:  string;
  };
  assumptions: {
    claim:       string;
    confidence:  'high' | 'medium' | 'low';
  }[];
  build_target: 'lovable' | 'bolt' | '8080';
}

// ─────────────────────────────────────────────────────────────
// GBSE PIPELINE TYPES
// ─────────────────────────────────────────────────────────────

/**
 * Raw output from GBSE runPipeline().
 *
 * BUG-01: correctionLog arrives as a raw string from the reconstructor
 * [CORRECTION LOG] section. Always normalise with normaliseCorrectionLog()
 * before filtering. Raw .filter() on a string returns undefined.
 *
 * PLANNED: stagnated, stagnationTags, and iterationCount require the
 * src/index.js prerequisite fix — expose all three in the runPipeline()
 * return object. These fields are NOT confirmed in the live GBSE return
 * contract until that fix is verified.
 */
export interface PipelineResult {
  /** Unprocessed verdict from GBSE reconstructor. */
  finalVerdict: 'PASS' | 'CONDITIONAL_PASS' | 'BLOCK';
  /** Raw string from the [CORRECTION LOG] section — must be normalised before use. */
  correctionLog: string | string[];
  diagnostics: {
    /**
     * True if Solver→Auditor loop stagnated.
     * [PLANNED — requires src/index.js prerequisite fix, not confirmed in live return]
     */
    stagnated: boolean;
    /**
     * Tag string produced when stagnation occurs.
     * [PLANNED — requires src/index.js prerequisite fix, not confirmed in live return]
     */
    stagnationTags: string;
    /**
     * Number of Solver→Auditor iterations completed.
     * [PLANNED — requires src/index.js prerequisite fix, not confirmed in live return]
     */
    iterationCount?: number;
  };
}

/** Gate result produced by triggerGate() for a single claim. */
export interface GateResult {
  verdict: 'BLOCK' | 'WARN' | 'PASS';
  confidence: string;
  claim: string;
  stagnated: boolean;
  stagnationTags: string;
  /** Raw hallucination lines extracted from correctionLog (post-normalisation). */
  hallucinationLines: string[];
  /** Raw debatable lines extracted from correctionLog (post-normalisation). */
  debatableLines: string[];
}

// ─────────────────────────────────────────────────────────────
// BUILDGATE SIGNAL TYPES
// ─────────────────────────────────────────────────────────────

/**
 * The structured signal BridgeLayer emits to BuildGate.
 *
 *   ALLOW        — claim verified, gate may proceed
 *   BLOCK        — hallucination confirmed, gate must hard-stop
 *   HUMAN_REVIEW — uncertain result or unaffirmed ATTA record, route to human
 *
 * IMPORTANT: ALLOW here is a BuildGate operational gate signal.
 * It is NOT the same as GBSE PASS, which is a verification result.
 * These two concepts are distinct and must not be conflated.
 */
export type GateDecision = 'ALLOW' | 'BLOCK' | 'HUMAN_REVIEW';

/**
 * Structured signal emitted by extractSignal() for BuildGate consumption.
 *
 * IMPORTANT: AFFIRMED ATTA status clears only the ATTA proof-status check.
 * It does NOT override a GBSE BLOCK or a BuildGate hard-stop condition.
 * Final ALLOW requires: GBSE result not BLOCK + BuildGate gate conditions
 * pass + ATTA AFFIRMED (where applicable).
 */
export interface GateSignal {
  decision: GateDecision;
  /** The GBSE pipeline result that produced this signal. */
  pipelineVerdict: PipelineResult['finalVerdict'];
  /** Human-readable reason for the decision. */
  reason: string;
  /** Machine-readable reason codes for programmatic consumers. e.g. ['BUG-01', 'STAGNATED'] */
  reasonCodes: string[];
  /** True if ATTA record was checked and governs this decision. */
  attaGoverned: boolean;
  /** The ATTA record ID checked, if any. */
  attaRecordId?: string;
  /** The ATTA status found, if checked. */
  attaStatus?: AttaStatus;
  claim: string;
  claimDomain: ClaimDomain;
  stakesLevel: StakesLevel;
  /** True if BuildGate may proceed based on this signal. */
  canProceed: boolean;
  /** True if this decision requires a human review step before BuildGate proceeds. */
  requiresHumanReview: boolean;
  /** Blueprint fields confirmed blocked (HALLUCINATION grade). */
  blockedFields: string[];
  /** Blueprint fields confirmed verified (VERIFIED grade). */
  verifiedFields: string[];
}

// ─────────────────────────────────────────────────────────────
// ATTA FRAMEWORK TYPES
// ─────────────────────────────────────────────────────────────

/**
 * ATTA proof status for a claim or claim class.
 *
 * AFFIRMED: clears the ATTA proof-status check only.
 *           Does not override GBSE BLOCK or BuildGate gate conditions.
 * PENDING / PROPOSED / PROPOSED_NOT_AFFIRMED: routes to HUMAN_REVIEW.
 * REJECTED: overrides any incoming signal to BLOCK.
 */
export type AttaStatus =
  | 'AFFIRMED'
  | 'PENDING'
  | 'PROPOSED'
  | 'PROPOSED_NOT_AFFIRMED'
  | 'REJECTED';

/** An ATTA record governing a claim class. */
export interface AttaRecord {
  id: string;
  claimClass: string;
  status: AttaStatus;
  updatedAt: string;
  author: string;
  note?: string;
}

// ─────────────────────────────────────────────────────────────
// DECISION LOG TYPES
// ─────────────────────────────────────────────────────────────

/**
 * A traceable log entry for every governed gate decision BridgeLayer emits.
 * Every ALLOW, BLOCK, and HUMAN_REVIEW must produce one entry.
 *
 * pipelineRunId is required and must be generated as:
 *   run_${hash(claimId:sourceBlueprintId:timestamp:pipelineVerdict)}
 */
export interface GateDecisionLog {
  logId:              string;
  timestamp:          string;
  /** Required — trace anchor linking claim to pipeline run. */
  pipelineRunId:      string;
  claim:              string;
  claimDomain:        ClaimDomain;
  stakesLevel:        StakesLevel;
  decisionRelevance:  DecisionRelevance;
  pipelineVerdict:    PipelineResult['finalVerdict'];
  gateDecision:       GateDecision;
  attaChecked:        boolean;
  attaRecordId?:      string;
  attaStatus?:        AttaStatus;
  reason:             string;
  reasonCodes:        string[];
  hallucinationLines: string[];
  debatableLines:     string[];
}

// ─────────────────────────────────────────────────────────────
// BLUEPRINT TYPES
// ─────────────────────────────────────────────────────────────

export type BlueprintGrade = 'VERIFIED' | 'DEBATABLE' | 'HALLUCINATION' | 'ASSUMED';

export type BuildVerdict =
  | 'BUILD_CLEAR'
  | 'BUILD_WITH_RISKS'
  | 'NEEDS_VALIDATION'
  | 'DO_NOT_BUILD';

/**
 * StampedBlueprint — produced by BridgeLayer.stampBlueprint().
 *
 * Distinct from RawBlueprint (emitted by BuildGate Phase 6).
 * sourceBlueprintId links this back to the RawBlueprint that was stamped.
 */
export interface StampedBlueprint {
  /** Unique ID for this stamped result. */
  blueprintId:        string;
  /** ID of the RawBlueprint this was stamped from. Links BuildGate → BridgeLayer. */
  sourceBlueprintId:  string;
  market_scores:      BlueprintGrade;
  problem_statement:  BlueprintGrade;
  moat_hypothesis:    BlueprintGrade;
  mvp_nodes:          BlueprintGrade;
  monetisation_event: BlueprintGrade;
  target_user:        BlueprintGrade;
  final_verdict:      BuildVerdict;
  /** Fields that reached VERIFIED grade. */
  verifiedFields:     string[];
  /** Fields that reached HALLUCINATION grade. */
  blockedFields:      string[];
  /** Fields still ASSUMED or DEBATABLE — require further evidence. */
  evidenceRequired:   string[];
  stagnation_meta:    { field: string; tags: string }[];
}
