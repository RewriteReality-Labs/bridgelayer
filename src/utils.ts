/**
 * bridge/utils.ts
 * ─────────────────────────────────────────────────────────────
 * Pure utility functions. No I/O. No side effects.
 * ─────────────────────────────────────────────────────────────
 */

import type { Claim } from './types';

/**
 * BUG-01 fix: normalise GBSE correctionLog to string[] before any .filter().
 */
export function normaliseCorrectionLog(raw: string | string[] | undefined | null): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(l => l.trim().length > 0);
  return String(raw).split('\n').filter(l => l.trim().length > 0);
}

export function extractHallucinationLines(lines: string[]): string[] {
  return lines.filter(l => l.includes('[HALLUCINATION]'));
}

export function extractDebatableLines(lines: string[]): string[] {
  return lines.filter(l => l.includes('[DEBATABLE]'));
}

/** Generates a GateDecisionLog logId. */
export function makeLogId(timestamp: string, claim: string): string {
  const ts = timestamp.replace(/[:.]/g, '-').slice(0, 19);
  const hash = simpleHash(claim).toString(16).padStart(8, '0');
  return `${ts}-${hash}`;
}

/**
 * Generates a required pipelineRunId.
 * Uses claimId + sourceBlueprintId + timestamp + pipelineVerdict for entropy.
 * claimId is the trace anchor — claim text alone can collide on repeated claims.
 */
export function makePipelineRunId(
  claimId: string,
  sourceBlueprintId: string,
  timestamp: string,
  pipelineVerdict: string,
): string {
  const raw = `${claimId}:${sourceBlueprintId}:${timestamp}:${pipelineVerdict}`;
  return `run_${simpleHash(raw).toString(16).padStart(8, '0')}`;
}

/**
 * Normalises a Claim object to the canonical schema.
 *
 * Accepts legacy `claim` field or new `statement` field.
 * Derives `blocking` from `decision_relevance` if not explicit.
 * Generates `claimId` if absent.
 *
 * Migration path: callers using the old { claim: string } shape
 * will continue to work. The deprecated `claim` field is preserved
 * on the output for backward compatibility.
 */
export function normaliseClaim(input: Partial<Claim> & { claim?: string }): Claim {
  const statement = input.statement ?? input.claim;

  if (!statement) {
    throw new Error('Claim requires statement or claim text');
  }

  return {
    claimId:           input.claimId ?? `cl_${simpleHash(statement + Date.now()).toString(16)}`,
    statement,
    claim:             statement,                                   // backward-compat alias
    domain:            input.domain!,
    stakes_level:      input.stakes_level!,
    decision_relevance: input.decision_relevance!,
    blocking:          input.blocking ?? input.decision_relevance === 'BLOCKING',
    source_phase:      input.source_phase,
    source_text:       input.source_text ?? statement,
  };
}

/** Deterministic numeric hash. Not cryptographic — for IDs only. */
function simpleHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}
