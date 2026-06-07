/**
 * bridge/constants.ts
 * ─────────────────────────────────────────────────────────────
 * Authoritative constants for BridgeLayer.
 * Import from here. Never hardcode inline.
 *
 * Master claim: GBSE_BUILDGATE_BRIDGELAYER_MASTER_CLAIM_001
 * ─────────────────────────────────────────────────────────────
 */

import type { Claim, ClaimDomain, StakesLevel, StampedBlueprint } from './types';

export const TOKEN_BUDGET: Record<StakesLevel, number> = {
  HIGH: 2048,
  MED:  1024,
  LOW:  512,
};

export const DOMAIN_TO_FIELD: Record<ClaimDomain, keyof Omit<StampedBlueprint, 'final_verdict' | 'stagnation_meta' | 'blueprintId' | 'sourceBlueprintId' | 'verifiedFields' | 'blockedFields' | 'evidenceRequired'>> = {
  market_sizing:       'market_scores',
  pain_validation:     'problem_statement',
  competitor_analysis: 'moat_hypothesis',
  technical_specs:     'mvp_nodes',
  pricing:             'monetisation_event',
  user_behaviour:      'target_user',
};

/** BUG-05 fix — do not modify without a master claim update. */
export const BLOCKING_FIELDS: (keyof StampedBlueprint)[] = [
  'problem_statement',
  'target_user',
  'moat_hypothesis',
];

export const ATTA_BLOCKING_STATUSES = new Set([
  'PROPOSED',
  'PROPOSED_NOT_AFFIRMED',
  'PENDING',
  'REJECTED',
]);

export const ATTA_CHECK_REQUIRED_STAKES: StakesLevel[] = ['HIGH', 'MED'];

/**
 * Claim domains that always require an ATTA governance check.
 * A LOW/CONTEXTUAL claim may skip ATTA only if its domain is NOT in this list.
 *
 * Rule: canSkipAttaCheck() returns true only when ALL of these hold:
 *   - stakes_level is LOW
 *   - decision_relevance is CONTEXTUAL
 *   - domain is not in ATTA_MANDATORY_DOMAINS
 *
 * security, compliance, financial_risk are forward-reserved — not yet active
 * ClaimDomain values, but listed here to prevent future unsafe skip logic.
 */
export const ATTA_MANDATORY_DOMAINS: string[] = [
  'market_sizing',
  'pain_validation',
  'user_behaviour',
  'security',        // forward-reserved
  'compliance',      // forward-reserved
  'financial_risk',  // forward-reserved
];

/**
 * Returns true if a claim is safe to skip the ATTA governance check.
 *
 * A claim may skip ONLY when ALL three conditions hold:
 *   1. stakes_level is LOW
 *   2. decision_relevance is CONTEXTUAL
 *   3. domain is not in ATTA_MANDATORY_DOMAINS
 *
 * Any HIGH or MED claim, any BLOCKING claim, or any claim in a mandatory
 * domain must go through the ATTA check regardless.
 */
export function canSkipAttaCheck(claim: Claim): boolean {
  return (
    claim.stakes_level === 'LOW' &&
    claim.decision_relevance === 'CONTEXTUAL' &&
    !ATTA_MANDATORY_DOMAINS.includes(claim.domain)
  );
}
