/**
 * bridge.ts
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * BridgeLayer â€” connects three systems with distinct jobs.
 *
 *   GBSE       â€” runs verification pipeline on any claim.
 *                Produces: PipelineResult (verdict + correctionLog + diagnostics)
 *
 *   BuildGate  â€” makes go/no-go decisions on consequential actions.
 *                Consumes: GateSignal (ALLOW / BLOCK / HUMAN_REVIEW)
 *
 *   ATTA       â€” governs whether a claim class has earned its status
 *                through the proof sequence.
 *                Produces: AttaRecord (AFFIRMED / PENDING / PROPOSED / REJECTED)
 *
 * Three functions. Nothing more.
 *
 *   1. extractSignal()     GBSE output â†’ GateSignal for BuildGate
 *   2. checkAttaRecord()   ATTA record status â†’ governs ALLOW on high-stakes claims
 *   3. logDecision()       Every gate decision â†’ traceable GateDecisionLog entry
 *
 * All five confirmed bug fixes (BUG-01 through BUG-05) are applied.
 * Pipeline failure is always WARN â€” silence is never verification.
 *
 * Master claim: GBSE_BUILDGATE_BRIDGELAYER_MASTER_CLAIM_001
 * RewriteReality Labs | ATTA | 2026-06-07
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

import type {
  Claim,
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

import {
  TOKEN_BUDGET,
  DOMAIN_TO_FIELD,
  BLOCKING_FIELDS,
  ATTA_BLOCKING_STATUSES,
  ATTA_CHECK_REQUIRED_STAKES,
  canSkipAttaCheck,
} from './constants';

import {
  normaliseCorrectionLog,
  extractHallucinationLines,
  extractDebatableLines,
  makeLogId,
  makePipelineRunId,
  normaliseClaim,
} from './utils';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// DEPENDENCY INJECTION INTERFACES
//
// BridgeLayer does not hardwire to GBSE or ATTA implementations.
// Callers inject both at construction time â€” enables testing without
// live pipeline or ATTA store.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * GBSE pipeline executor interface.
 * Implement this to connect to the real GBSE runPipeline() in src/index.js.
 * The real implementation must expose stagnated + stagnationTags in its return
 * (src/index.js prerequisite fix â€” see KNOWLEDGE_BASE.md Â§3.2).
 */
export interface GbsePipeline {
  runPipeline(claim: string, options: { maxTokensSolver: number }): Promise<PipelineResult>;
}

/**
 * ATTA record store interface.
 * Implement this to connect to the real ATTA governance record backend.
 * Returns null if no record exists for the given claim class.
 */
export interface AttaStore {
  getRecord(claimClass: string): Promise<AttaRecord | null>;
}

/**
 * Decision log sink interface.
 * Implement this to persist GateDecisionLog entries (file, DB, stdout, etc.).
 */
export interface DecisionLogSink {
  write(entry: GateDecisionLog): Promise<void>;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// BRIDGELAYER CLASS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export class BridgeLayer {
  private gbse: GbsePipeline;
  private atta: AttaStore;
  private log: DecisionLogSink;

  constructor(gbse: GbsePipeline, atta: AttaStore, log: DecisionLogSink) {
    this.gbse = gbse;
    this.atta = atta;
    this.log  = log;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // FUNCTION 1: extractSignal
  //
  // Takes a single Claim and runs the GBSE verification pipeline on it.
  // Translates the raw pipeline output into a GateSignal that BuildGate
  // can act on directly.
  //
  //   GBSE PASS / CONDITIONAL_PASS  â†’  maps to ALLOW (subject to ATTA check)
  //   GBSE BLOCK                    â†’  maps to BLOCK
  //   Pipeline exception            â†’  maps to HUMAN_REVIEW (never ALLOW)
  //   Stagnated loop                â†’  maps to HUMAN_REVIEW
  //   Hallucination lines present   â†’  maps to BLOCK
  //   Debatable lines present       â†’  maps to HUMAN_REVIEW
  //
  // Token budget is routed by claim.stakes_level (BUG-03 fix).
  // correctionLog is normalised before filtering (BUG-01 fix).
  // Pipeline failure returns HUMAN_REVIEW â€” silence is never ALLOW. (pipeline failure rule)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async extractSignal(claim: Claim): Promise<GateSignal> {
    // BUG-03 fix: token budget routed by stakes level â€” never hardcoded.
    const tokenBudget = TOKEN_BUDGET[claim.stakes_level] ?? TOKEN_BUDGET.MED;

    let pipelineResult: PipelineResult;

    try {
      pipelineResult = await this.gbse.runPipeline(claim.statement ?? claim.claim ?? '', {
        maxTokensSolver: tokenBudget,
      });
    } catch (err) {
      // Pipeline failure rule: exception â†’ HUMAN_REVIEW, never ALLOW.
      // Silence is not verification.
      const signal: GateSignal = {
        decision:            'HUMAN_REVIEW',
        pipelineVerdict:     'BLOCK',
        reason:              `Pipeline threw during execution: ${String(err)}. Routed to human review â€” silence is not verification.`,
        reasonCodes:         ['PIPELINE_EXCEPTION'],
        attaGoverned:        false,
        claim:               claim.statement ?? claim.claim ?? '',
        claimDomain:         claim.domain,
        stakesLevel:         claim.stakes_level,
        canProceed:          false,
        requiresHumanReview: true,
        blockedFields:       [],
        verifiedFields:      [],
      };
      await this.logDecision(claim, pipelineResult!, signal);
      return signal;
    }

    // BUG-01 fix: normalise correctionLog to string[] before any .filter() call.
    const logLines       = normaliseCorrectionLog(pipelineResult.correctionLog);
    const hallucinations = extractHallucinationLines(logLines);
    const debatables     = extractDebatableLines(logLines);

    const stagnated      = pipelineResult.diagnostics?.stagnated === true;
    const stagnationTags = pipelineResult.diagnostics?.stagnationTags ?? '';

    // Build the raw GateResult for internal use
    const gateResult: GateResult = {
      verdict:          deriveGbseVerdict(pipelineResult.finalVerdict, hallucinations, stagnated),
      confidence:       hallucinations.length === 0 && !stagnated ? 'HIGH' : 'LOW',
      claim:            claim.statement ?? claim.claim ?? '',
      stagnated,
      stagnationTags,
      hallucinationLines: hallucinations,
      debatableLines:     debatables,
    };

    // Translate GBSE verdict â†’ BuildGate decision
    let decision: GateDecision;
    let reason: string;

    if (gateResult.verdict === 'BLOCK') {
      decision = 'BLOCK';
      reason   = `GBSE confirmed hallucination. Lines: ${hallucinations.join(' | ')}`;
    } else if (gateResult.verdict === 'WARN' || stagnated) {
      decision = 'HUMAN_REVIEW';
      reason   = stagnated
        ? `GBSE Solverâ†’Auditor loop stagnated. Tags: ${stagnationTags}. Cannot auto-resolve.`
        : `GBSE returned WARN with debatable findings: ${debatables.join(' | ')}`;
    } else {
      // PASS â€” still subject to ATTA check below
      decision = 'ALLOW';
      reason   = 'GBSE pipeline returned PASS with no hallucination or debatable findings.';
    }

    const signal: GateSignal = {
      decision,
      pipelineVerdict:     pipelineResult.finalVerdict,
      reason,
      reasonCodes:         [],
      attaGoverned:        false,
      claim:               claim.statement ?? claim.claim ?? '',
      claimDomain:         claim.domain,
      stakesLevel:         claim.stakes_level,
      canProceed:          decision === 'ALLOW',
      requiresHumanReview: decision === 'HUMAN_REVIEW',
      blockedFields:       hallucinations.length > 0 ? [DOMAIN_TO_FIELD[claim.domain] as string] : [],
      verifiedFields:      gateResult.verdict === 'PASS' ? [DOMAIN_TO_FIELD[claim.domain] as string] : [],
    };

    await this.logDecision(claim, pipelineResult, signal);
    return signal;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // FUNCTION 2: checkAttaRecord
  //
  // Before BuildGate fires ALLOW on a high-stakes BLOCKING claim,
  // this function checks whether that claim class has an AFFIRMED
  // ATTA record.
  //
  // Rules:
  //   - LOW stakes claims skip the ATTA check.
  //   - CONTEXTUAL claims skip the ATTA check.
  //   - AFFIRMED status â†’ signal passes through unchanged.
  //   - PROPOSED / PENDING / PROPOSED_NOT_AFFIRMED â†’ override ALLOW to HUMAN_REVIEW.
  //   - REJECTED â†’ override any signal to BLOCK.
  //   - No record found â†’ override ALLOW to HUMAN_REVIEW (unverified claim class).
  //
  // This function does not re-run the pipeline. It only governs ALLOW decisions.
  // BLOCK decisions from extractSignal() are not overridden.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async checkAttaRecord(
    claim: Claim,
    incomingSignal: GateSignal
  ): Promise<GateSignal> {
    // Only apply ATTA governance to claims that require it
    const requiresCheck = !canSkipAttaCheck(claim);

    if (!requiresCheck) {
      return incomingSignal; // LOW stakes or CONTEXTUAL â€” pass through
    }

    // Only govern ALLOW decisions â€” BLOCK remains BLOCK
    if (incomingSignal.decision === 'BLOCK') {
      return incomingSignal;
    }

    const record = await this.atta.getRecord(claim.domain);

    let governed = incomingSignal;

    if (!record) {
      // No ATTA record exists for this claim class â€” cannot auto-allow
      governed = {
        ...incomingSignal,
        decision:     'HUMAN_REVIEW',
        attaGoverned: true,
        attaRecordId: undefined,
        attaStatus:   undefined,
        reason:       `No ATTA record found for claim class '${claim.domain}'. ALLOW requires an AFFIRMED record.`,
      };
    } else if (record.status === 'REJECTED') {
      // REJECTED record overrides even a clean GBSE PASS
      governed = {
        ...incomingSignal,
        decision:     'BLOCK',
        attaGoverned: true,
        attaRecordId: record.id,
        attaStatus:   record.status,
        reason:       `ATTA record ${record.id} status is REJECTED. Gate blocked regardless of pipeline verdict.`,
      };
    } else if (ATTA_BLOCKING_STATUSES.has(record.status)) {
      // PROPOSED or PENDING â€” route to human review
      governed = {
        ...incomingSignal,
        decision:     'HUMAN_REVIEW',
        attaGoverned: true,
        attaRecordId: record.id,
        attaStatus:   record.status,
        reason:       `ATTA record ${record.id} is ${record.status}. ALLOW requires AFFIRMED status before this claim class can auto-pass.`,
      };
    } else {
      // AFFIRMED â€” signal passes through with ATTA provenance attached
      governed = {
        ...incomingSignal,
        attaGoverned: true,
        attaRecordId: record.id,
        attaStatus:   record.status,
        reason:       `${incomingSignal.reason} ATTA record ${record.id} is AFFIRMED.`,
      };
    }

    // Re-log the final governed decision with ATTA provenance
    await this.log.write(
      makeDecisionLogEntry(claim, incomingSignal.pipelineVerdict, governed, [], [])
    );

    return governed;
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // FUNCTION 3: logDecision
  //
  // Every gate decision â€” ALLOW, BLOCK, HUMAN_REVIEW â€” gets a log entry.
  // No decision leaves BridgeLayer without a traceable record containing:
  //   - which pipeline run produced it (pipelineRunId if available)
  //   - which ATTA record governed it (if checked)
  //   - the exact timestamp
  //   - the claim text
  //   - hallucination and debatable lines from the correctionLog
  //
  // Private â€” called internally by extractSignal() and checkAttaRecord().
  // Exposed as a standalone method for external callers who need to log
  // decisions made outside the normal flow (e.g. human overrides).
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async logDecision(
    claim: Claim,
    pipelineResult: PipelineResult | null,
    signal: GateSignal
  ): Promise<void> {
    const logLines       = pipelineResult
      ? normaliseCorrectionLog(pipelineResult.correctionLog)
      : [];
    const hallucinations = extractHallucinationLines(logLines);
    const debatables     = extractDebatableLines(logLines);

    const entry = makeDecisionLogEntry(
      claim,
      pipelineResult?.finalVerdict ?? 'BLOCK',
      signal,
      hallucinations,
      debatables,
    );

    await this.log.write(entry);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // FULL BRIDGE CYCLE
  //
  // Convenience method: runs extractSignal â†’ checkAttaRecord â†’ returns
  // the final governed GateSignal for BuildGate to act on.
  // The decision log is written at each stage.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async process(claim: Claim): Promise<GateSignal> {
    const signal  = await this.extractSignal(claim);
    const governed = await this.checkAttaRecord(claim, signal);
    return governed;
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// LEGACY THREE-FUNCTION API
//
// Standalone exports matching the original bridge.js function signatures
// from bridge_exact.txt. These wrap BridgeLayer with default no-op
// ATTA and log implementations for callers that haven't migrated.
//
// For full ATTA governance, use BridgeLayer class directly.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import Anthropic from '@anthropic-ai/sdk';

const _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Parses a raw natural language phase input into an array of discrete,
 * classifiable Claim objects using Claude.
 *
 * BUG-04 fix: if phaseInput is substantial (> 100 chars) and zero claims
 * are extracted, inject one UNVERIFIED_DEFAULT claim to prevent silent pass.
 */
export async function extractClaims(
  phaseInput: string,
  phaseNumber: number
): Promise<Claim[]> {
  if (!phaseInput || typeof phaseInput !== 'string') return [];

  const prompt = `Extract every verifiable factual claim from this text.

TEXT: ${phaseInput}

Return a JSON array only. Each item must have:
- "claim": the exact verifiable statement
- "domain": one of: market_sizing, pain_validation, competitor_analysis, technical_specs, pricing, user_behaviour
- "stakes_level": HIGH (market/revenue/customer claims) | MED (scope/technical) | LOW (logistics)
- "decision_relevance": BLOCKING (must be true for build to be justified) | CONTEXTUAL (supportive)

Output valid JSON array only. No preamble. No backticks.`;

  let claims: Claim[] = [];

  try {
    const response = await _client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages:   [{ role: 'user', content: prompt }],
    });

    const raw   = response.content?.[0]?.type === 'text' ? response.content[0].text.trim() : '';
    const clean = raw.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(clean);

    if (Array.isArray(parsed)) {
      claims = parsed.filter(
        (c): c is Claim =>
          c && typeof c.claim === 'string' && c.claim.length > 0
      ).map(c => ({ ...c, source_phase: phaseNumber }));
    }
  } catch {
    // Parse or API failure â€” fall through to BUG-04 guard below.
  }

  // BUG-04 fix: substantial input with zero claims = silent pass risk.
  // Inject UNVERIFIED_DEFAULT to force explicit GBSE verification.
  if (claims.length === 0 && phaseInput.trim().length > 100) {
    claims = [normaliseClaim({
      claim:              phaseInput.slice(0, 200),
      domain:             'pain_validation',
      stakes_level:       'HIGH',
      decision_relevance: 'BLOCKING',
      source_phase:       phaseNumber,
    })];
  }

  return claims;
}

/**
 * Runs GBSE on a single claim via runPipeline() from src/index.js.
 * Returns BLOCK / WARN / PASS.
 *
 * BUG-01 fix: normalises correctionLog before filtering.
 * BUG-03 fix: token budget routed by claim.stakes_level.
 * Pipeline failure rule: exception â†’ WARN, never PASS.
 *
 * NOTE: requires the src/index.js prerequisite fix â€” runPipeline() must
 * expose stagnated and stagnationTags in its return object.
 */
export async function triggerGate(claim: Claim): Promise<GateResult> {
  // BUG-03 fix: route by stakes level â€” never hardcode.
  const tokenBudget = TOKEN_BUDGET[claim.stakes_level] ?? TOKEN_BUDGET.MED;

  let result: PipelineResult;

  try {
    // runPipeline lives in src/index.js (the GBSE pipeline entry point).
    // It is NOT re-exported from bridge/index.ts â€” this dynamic import
    // targets the GBSE file directly. Requires the src/index.js prerequisite
    // fix: runPipeline must expose stagnated + stagnationTags in its return.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gbse: any = await import(/* webpackIgnore: true */ './index.js');
    result = await gbse.runPipeline(claim.statement ?? claim.claim ?? '', { maxTokensSolver: tokenBudget });
  } catch (err) {
    // Pipeline failure rule: exception â†’ WARN. Silence is not verification.
    return {
      verdict:           'WARN',
      confidence:        'ASSUMED',
      claim:             claim.statement ?? claim.claim ?? '',
      stagnated:         false,
      stagnationTags:    '',
      hallucinationLines: [],
      debatableLines:    [],
    };
  }

  // BUG-01 fix: normalise correctionLog to line array before .filter()
  const logLines       = normaliseCorrectionLog(result.correctionLog);
  const hallucinations = extractHallucinationLines(logLines);
  const debatables     = extractDebatableLines(logLines);
  const stagnated      = result.diagnostics?.stagnated === true;

  return {
    verdict:           deriveGbseVerdict(result.finalVerdict, hallucinations, stagnated),
    confidence:        hallucinations.length === 0 && !stagnated ? 'HIGH' : 'LOW',
    claim:             claim.statement ?? claim.claim ?? '',
    stagnated,
    stagnationTags:    result.diagnostics?.stagnationTags ?? '',
    hallucinationLines: hallucinations,
    debatableLines:    debatables,
  };
}

/**
 * Maps verified/failed claims to Blueprint fields and emits the final
 * build verdict.
 *
 * BUG-02 fix: all Blueprint fields initialised to 'ASSUMED' before stamping.
 * BUG-05 fix: DEBATABLE on a BLOCKING field escalates to NEEDS_VALIDATION.
 */
export function stampBlueprint(
  claims:      Claim[],
  gateResults: GateResult[]
): StampedBlueprint {
  // BUG-02 fix: initialise all fields to ASSUMED â€” never leave undefined.
  const blueprint: StampedBlueprint = {
    blueprintId:        `bp_${Date.now()}`,
    sourceBlueprintId:  '',
    market_scores:      'ASSUMED',
    problem_statement:  'ASSUMED',
    moat_hypothesis:    'ASSUMED',
    mvp_nodes:          'ASSUMED',
    monetisation_event: 'ASSUMED',
    target_user:        'ASSUMED',
    final_verdict:      'BUILD_CLEAR',
    verifiedFields:     [],
    blockedFields:      [],
    evidenceRequired:   [],
    stagnation_meta:    [],
  };

  for (let i = 0; i < claims.length; i++) {
    const claim  = claims[i];
    const result = gateResults[i];
    if (!claim || !result) continue;

    const field = String(DOMAIN_TO_FIELD[claim.domain]);
    if (!field || !(field in blueprint)) continue;

    const incoming = verdictToGrade(result);
    const gradeFields: Record<string, keyof StampedBlueprint> = { market_scores: 'market_scores', problem_statement: 'problem_statement', moat_hypothesis: 'moat_hypothesis', mvp_nodes: 'mvp_nodes', monetisation_event: 'monetisation_event', target_user: 'target_user' };
    const safeField = gradeFields[field];
    if (!safeField) continue;
    const current = (blueprint[safeField] as BlueprintGrade) ?? 'ASSUMED';
    switch (safeField) {
      case 'market_scores':
        blueprint.market_scores = mergeGrade(current, incoming);
        break;
      case 'problem_statement':
        blueprint.problem_statement = mergeGrade(current, incoming);
        break;
      case 'moat_hypothesis':
        blueprint.moat_hypothesis = mergeGrade(current, incoming);
        break;
      case 'mvp_nodes':
        blueprint.mvp_nodes = mergeGrade(current, incoming);
        break;
      case 'monetisation_event':
        blueprint.monetisation_event = mergeGrade(current, incoming);
        break;
      case 'target_user':
        blueprint.target_user = mergeGrade(current, incoming);
        break;
    }

    if (result.stagnated && result.stagnationTags) {
      blueprint.stagnation_meta.push({ field, tags: result.stagnationTags });
    }
  }

  // BUG-05 fix applied in deriveVerdict â€” DEBATABLE on blocking field â†’
  // NEEDS_VALIDATION not BUILD_WITH_RISKS.
  blueprint.final_verdict = deriveVerdict(blueprint);
  return blueprint;
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// PRIVATE HELPERS
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Translates a GBSE finalVerdict + correction log findings into the
 * three-value GBSE gate verdict: BLOCK / WARN / PASS.
 *
 * Stagnated loops are always WARN â€” they cannot be auto-resolved.
 */
function deriveGbseVerdict(
  finalVerdict: PipelineResult['finalVerdict'],
  hallucinationLines: string[],
  stagnated: boolean
): GateResult['verdict'] {
  if (finalVerdict === 'BLOCK' || hallucinationLines.length > 0) return 'BLOCK';
  if (stagnated) return 'WARN';
  if (finalVerdict === 'CONDITIONAL_PASS') return 'WARN';
  return 'PASS';
}

/** Maps a gate result to a Blueprint grade. */
function verdictToGrade(result: GateResult): BlueprintGrade {
  if (result.verdict === 'BLOCK')                  return 'HALLUCINATION';
  if (result.verdict === 'PASS' && !result.stagnated) return 'VERIFIED';
  return 'DEBATABLE';
}

/**
 * Merge rule: the worst grade wins.
 * HALLUCINATION > DEBATABLE > ASSUMED > VERIFIED
 * ASSUMED is a placeholder â€” any real result overwrites it.
 */
function mergeGrade(existing: BlueprintGrade, incoming: BlueprintGrade): BlueprintGrade {
  const rank: Record<BlueprintGrade, number> = {
    HALLUCINATION: 4,
    DEBATABLE:     3,
    VERIFIED:      2,
    ASSUMED:       1,
  };
  return rank[incoming] >= rank[existing] ? incoming : existing;
}

/**
 * Derives the final build verdict from a stamped Blueprint.
 * Strict priority order â€” do not reorder these checks.
 *
 * 1. Any HALLUCINATION?                     â†’ DO_NOT_BUILD
 * 2. DEBATABLE on a BLOCKING_FIELD?          â†’ NEEDS_VALIDATION   (BUG-05)
 * 3. Any DEBATABLE on non-blocking field?    â†’ BUILD_WITH_RISKS
 * 4. All remaining fields VERIFIED/ASSUMED?  â†’ BUILD_CLEAR
 */
function deriveVerdict(bp: StampedBlueprint): BuildVerdict {
  const fields = Object.keys(DOMAIN_TO_FIELD) as (keyof typeof DOMAIN_TO_FIELD)[];
  const grades = fields.map(domain => ({
    field: DOMAIN_TO_FIELD[domain] as keyof StampedBlueprint,
    grade: bp[DOMAIN_TO_FIELD[domain] as keyof StampedBlueprint] as BlueprintGrade,
  }));

  if (grades.some(g => g.grade === 'HALLUCINATION'))  return 'DO_NOT_BUILD';

  // BUG-05 fix
  const blockingDebatable = grades.some(
    g => g.grade === 'DEBATABLE' && (BLOCKING_FIELDS as string[]).includes(g.field as string)
  );
  if (blockingDebatable) return 'NEEDS_VALIDATION';

  if (grades.some(g => g.grade === 'DEBATABLE'))      return 'BUILD_WITH_RISKS';
  return 'BUILD_CLEAR';
}

/** Constructs a GateDecisionLog entry. */
function makeDecisionLogEntry(
  claim:             Claim,
  pipelineVerdict:   PipelineResult['finalVerdict'],
  signal:            GateSignal,
  hallucinationLines: string[],
  debatableLines:    string[],
): GateDecisionLog {
  const timestamp = new Date().toISOString();
  const claimText = claim.statement ?? claim.claim ?? '';
  return {
    logId:              makeLogId(timestamp, claimText),
    timestamp,
    pipelineRunId:      makePipelineRunId(claim.claimId ?? claimText, 'unknown', timestamp, pipelineVerdict),
    claim:              claimText,
    claimDomain:        claim.domain,
    stakesLevel:        claim.stakes_level,
    decisionRelevance:  claim.decision_relevance,
    pipelineVerdict,
    gateDecision:       signal.decision,
    attaChecked:        signal.attaGoverned,
    attaRecordId:       signal.attaRecordId,
    attaStatus:         signal.attaStatus,
    reason:             signal.reason,
    reasonCodes:        signal.reasonCodes ?? [],
    hallucinationLines,
    debatableLines,
  };
}
