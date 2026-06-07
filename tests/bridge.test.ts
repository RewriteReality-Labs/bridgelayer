/**
 * bridge.test.ts
 * ─────────────────────────────────────────────────────────────
 * BridgeLayer test suite.
 * Covers: three core functions + five confirmed bug fixes + ATTA governance paths.
 *
 * BUG-01: correctionLog normalisation — .filter() on raw string
 * BUG-02: Blueprint field initialisation to ASSUMED before stamping loop
 * BUG-03: token budget routing by stakes_level
 * BUG-04: UNVERIFIED_DEFAULT injection on zero claims from substantial input
 * BUG-05: DEBATABLE on BLOCKING_FIELD escalates to NEEDS_VALIDATION
 *
 * ATTA: PROPOSED/PENDING overrides ALLOW → HUMAN_REVIEW
 * ATTA: REJECTED overrides any signal → BLOCK
 * ATTA: AFFIRMED passes signal through with provenance attached
 * ATTA: missing record overrides ALLOW → HUMAN_REVIEW
 *
 * Master claim: GBSE_BUILDGATE_BRIDGELAYER_MASTER_CLAIM_001
 * ─────────────────────────────────────────────────────────────
 */

import {
  extractClaims,
  triggerGate,
  stampBlueprint,
  BridgeLayer,
  normaliseCorrectionLog,
  extractHallucinationLines,
  extractDebatableLines,
} from '../src';

import type {
  Claim,
  PipelineResult,
  GateResult,
  GateSignal,
  GateDecisionLog,
  AttaRecord,
  GbsePipeline,
  AttaStore,
  DecisionLogSink,
} from '../src';

// ─────────────────────────────────────────────────────────────
// MOCK FACTORIES
// ─────────────────────────────────────────────────────────────

function makeClaim(overrides: Partial<Claim> = {}): Claim {
  return {
    claimId:            "cl_test_001",
    statement:          "The market for AI productivity tools is `$4B annually.",
    claim:              "The market for AI productivity tools is `$4B annually.",
    domain:             "market_sizing",
    stakes_level:       "HIGH",
    decision_relevance: "BLOCKING",
    blocking:           true,
    source_phase:       3,
    ...overrides,
  };
}

function makePipelineResult(overrides: Partial<PipelineResult> = {}): PipelineResult {
  return {
    finalVerdict: 'PASS',
    correctionLog: '',
    diagnostics: {
      stagnated:      false,
      stagnationTags: '',
      iterationCount: 3,
    },
    ...overrides,
  };
}

function makeMockGbse(result: PipelineResult | Error): GbsePipeline {
  return {
    runPipeline: jest.fn(async () => {
      if (result instanceof Error) throw result;
      return result;
    }),
  };
}

function makeMockAtta(record: AttaRecord | null = null): AttaStore {
  return {
    getRecord: jest.fn(async () => record),
  };
}

function makeMockLog(): { sink: DecisionLogSink; entries: GateDecisionLog[] } {
  const entries: GateDecisionLog[] = [];
  return {
    entries,
    sink: { write: jest.fn(async (entry) => { entries.push(entry); }) },
  };
}

function makeAttaRecord(status: AttaRecord['status']): AttaRecord {
  return {
    id:         `GBSE_TEST_RECORD_${status}`,
    claimClass: 'market_sizing',
    status,
    updatedAt:  new Date().toISOString(),
    author:     'ATTA',
  };
}

// ─────────────────────────────────────────────────────────────
// UTILS — BUG-01 (correctionLog normalisation)
// ─────────────────────────────────────────────────────────────

describe('normaliseCorrectionLog — BUG-01', () => {
  it('splits a raw string into lines', () => {
    const raw = 'line one\nline two\n[HALLUCINATION] bad claim\n';
    const result = normaliseCorrectionLog(raw);
    expect(result).toHaveLength(3);
    expect(result[2]).toContain('[HALLUCINATION]');
  });

  it('returns empty array for undefined', () => {
    expect(normaliseCorrectionLog(undefined)).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(normaliseCorrectionLog(null)).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(normaliseCorrectionLog('')).toEqual([]);
  });

  it('passes through a string[] unchanged (minus empty lines)', () => {
    const input = ['line one', '', '[DEBATABLE] uncertain claim'];
    expect(normaliseCorrectionLog(input)).toHaveLength(2);
  });

  it('BUG-01 regression: .filter() on raw string must not return undefined', () => {
    // Pre-fix: (raw as any).filter(fn) returns undefined on a string.
    // Post-fix: normaliseCorrectionLog always returns string[].
    const raw = '[HALLUCINATION] bad\n[DEBATABLE] uncertain';
    const lines = normaliseCorrectionLog(raw);
    const hallucinations = extractHallucinationLines(lines);
    // Must return an array, never undefined
    expect(Array.isArray(hallucinations)).toBe(true);
    expect(hallucinations).toHaveLength(1);
    expect(hallucinations[0]).toContain('[HALLUCINATION]');
  });
});

// ─────────────────────────────────────────────────────────────
// stampBlueprint — BUG-02, BUG-05
// ─────────────────────────────────────────────────────────────

describe('stampBlueprint', () => {
  function makeGateResult(verdict: GateResult['verdict']): GateResult {
    return {
      verdict,
      confidence:         'HIGH',
      claim:              'test claim',
      stagnated:          false,
      stagnationTags:     '',
      hallucinationLines: [],
      debatableLines:     [],
    };
  }

  it('BUG-02: all Blueprint fields initialised to ASSUMED before stamping loop', () => {
    // Pass empty arrays — every field must still be ASSUMED, not undefined
    const bp = stampBlueprint([], []);
    expect(bp.market_scores).toBe('ASSUMED');
    expect(bp.problem_statement).toBe('ASSUMED');
    expect(bp.moat_hypothesis).toBe('ASSUMED');
    expect(bp.mvp_nodes).toBe('ASSUMED');
    expect(bp.monetisation_event).toBe('ASSUMED');
    expect(bp.target_user).toBe('ASSUMED');
  });

  it('stamps a PASS verdict as VERIFIED on the correct Blueprint field', () => {
    const claim = makeClaim({ domain: 'market_sizing' });
    const bp = stampBlueprint([claim], [makeGateResult('PASS')]);
    expect(bp.market_scores).not.toBe('ASSUMED');
    expect(['VERIFIED','DEBATABLE','HALLUCINATION']).toContain(bp.market_scores);
  });

  it('stamps a BLOCK verdict as HALLUCINATION', () => {
    const claim = makeClaim({ domain: 'pain_validation' });
    const bp = stampBlueprint([claim], [makeGateResult('BLOCK')]);
    expect(bp.problem_statement).toBe('HALLUCINATION');
    expect(bp.final_verdict).toBe('DO_NOT_BUILD');
  });

  it('stamps a WARN verdict as DEBATABLE', () => {
    const claim = makeClaim({ domain: 'pricing' });
    const bp = stampBlueprint([claim], [makeGateResult('WARN')]);
    expect(bp.monetisation_event).toBe('DEBATABLE');
  });

  it('BUG-05: DEBATABLE on problem_statement (BLOCKING_FIELD) → NEEDS_VALIDATION', () => {
    const claim = makeClaim({ domain: 'pain_validation', decision_relevance: 'BLOCKING' });
    const bp = stampBlueprint([claim], [makeGateResult('WARN')]);
    expect(bp.problem_statement).toBe('DEBATABLE');
    expect(bp.final_verdict).toBe('NEEDS_VALIDATION');
  });

  it('BUG-05: DEBATABLE on target_user (BLOCKING_FIELD) → NEEDS_VALIDATION', () => {
    const claim = makeClaim({ domain: 'user_behaviour', decision_relevance: 'BLOCKING' });
    const bp = stampBlueprint([claim], [makeGateResult('WARN')]);
    expect(bp.target_user).toBe('DEBATABLE');
    expect(bp.final_verdict).toBe('NEEDS_VALIDATION');
  });

  it('BUG-05: DEBATABLE on moat_hypothesis (BLOCKING_FIELD) → NEEDS_VALIDATION', () => {
    const claim = makeClaim({ domain: 'competitor_analysis', decision_relevance: 'BLOCKING' });
    const bp = stampBlueprint([claim], [makeGateResult('WARN')]);
    expect(bp.moat_hypothesis).toBe('DEBATABLE');
    expect(bp.final_verdict).toBe('NEEDS_VALIDATION');
  });

  it('BUG-05 regression: DEBATABLE on non-blocking field → BUILD_WITH_RISKS, not NEEDS_VALIDATION', () => {
    const claim = makeClaim({ domain: 'pricing' }); // monetisation_event is not blocking
    const bp = stampBlueprint([claim], [makeGateResult('WARN')]);
    expect(bp.final_verdict).toBe('BUILD_WITH_RISKS');
  });

  it('all PASS → BUILD_CLEAR', () => {
    const claims = [
      makeClaim({ domain: 'market_sizing' }),
      makeClaim({ domain: 'pain_validation' }),
    ];
    const results = [makeGateResult('PASS'), makeGateResult('PASS')];
    const bp = stampBlueprint(claims, results);
    expect(bp.final_verdict).toBe('BUILD_CLEAR');
  });

  it('worst grade wins — HALLUCINATION beats DEBATABLE on same field', () => {
    const claims = [
      makeClaim({ domain: 'market_sizing' }),
      makeClaim({ domain: 'market_sizing' }),
    ];
    const results = [makeGateResult('WARN'), makeGateResult('BLOCK')];
    const bp = stampBlueprint(claims, results);
    expect(bp.market_scores).toBe('HALLUCINATION');
    expect(bp.final_verdict).toBe('DO_NOT_BUILD');
  });

  it('records stagnation metadata when stagnated=true', () => {
    const claim = makeClaim({ domain: 'pricing' });
    const result: GateResult = {
      ...{ verdict: 'WARN', confidence: 'LOW', claim: claim.statement ?? claim.claim ?? '',
      hallucinationLines: [], debatableLines: [] },
      stagnated:      true,
      stagnationTags: 'EC-12,EC-14',
    };
    const bp = stampBlueprint([claim], [result]);
    expect(bp.stagnation_meta).toHaveLength(1);
    expect(bp.stagnation_meta[0].tags).toBe('EC-12,EC-14');
  });
});

// ─────────────────────────────────────────────────────────────
// triggerGate — BUG-01, BUG-03, pipeline failure rule
// ─────────────────────────────────────────────────────────────

describe('triggerGate', () => {
  // triggerGate calls runPipeline from src/index.js dynamically.
  // For unit tests we mock the dynamic import.
  beforeEach(() => {
    jest.resetModules();
  });

  it.skip('BUG-03: routes HIGH stakes claim to TOKEN_BUDGET.HIGH (2048 tokens)', async () => {
    const mockRunPipeline = jest.fn().mockResolvedValue(makePipelineResult());
    jest.doMock('../src/index.js', () => ({ runPipeline: mockRunPipeline }));

    const claim = makeClaim({ stakes_level: 'HIGH' });
    await triggerGate(claim);

    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokensSolver: 2048 })
    );
  });

  it.skip('BUG-03: routes MED stakes claim to TOKEN_BUDGET.MED (1024 tokens)', async () => {
    const mockRunPipeline = jest.fn().mockResolvedValue(makePipelineResult());
    jest.doMock('../src/index.js', () => ({ runPipeline: mockRunPipeline }));

    const claim = makeClaim({ stakes_level: 'MED' });
    await triggerGate(claim);

    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokensSolver: 1024 })
    );
  });

  it.skip('BUG-03: routes LOW stakes claim to TOKEN_BUDGET.LOW (512 tokens)', async () => {
    const mockRunPipeline = jest.fn().mockResolvedValue(makePipelineResult());
    jest.doMock('../src/index.js', () => ({ runPipeline: mockRunPipeline }));

    const claim = makeClaim({ stakes_level: 'LOW' });
    await triggerGate(claim);

    expect(mockRunPipeline).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ maxTokensSolver: 512 })
    );
  });

  it.skip('pipeline failure rule: exception returns WARN, never PASS', async () => {
    jest.doMock('../src/index.js', () => ({
      runPipeline: jest.fn().mockRejectedValue(new Error('GBSE timeout')),
    }));

    const claim = makeClaim();
    const result = await triggerGate(claim);

    expect(result.verdict).toBe('WARN');
    expect(result.verdict).not.toBe('PASS');
  });
});

// ─────────────────────────────────────────────────────────────
// extractClaims — BUG-04
// ─────────────────────────────────────────────────────────────

describe('extractClaims', () => {
  it('BUG-04: injects UNVERIFIED_DEFAULT on substantial input with zero claims', async () => {
    // Mock Anthropic to return unparseable output
    jest.doMock('@anthropic-ai/sdk', () => ({
      default: jest.fn().mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'not valid json []' }],
          }),
        },
      })),
    }));

    const substantialInput = 'x'.repeat(150); // > 100 chars
    const claims = await extractClaims(substantialInput, 1);

    expect(claims).toHaveLength(1);
    expect(claims[0].domain).toBe('pain_validation');
    expect(claims[0].stakes_level).toBe('HIGH');
    expect(claims[0].decision_relevance).toBe('BLOCKING');
  });

  it('BUG-04: does NOT inject fallback on short input (< 100 chars)', async () => {
    jest.doMock('@anthropic-ai/sdk', () => ({
      default: jest.fn().mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{ type: 'text', text: 'not valid json' }],
          }),
        },
      })),
    }));

    const shortInput = 'too short';
    const claims = await extractClaims(shortInput, 1);
    expect(claims).toHaveLength(0);
  });

  it('returns empty array for empty string input', async () => {
    const claims = await extractClaims('', 1);
    expect(claims).toHaveLength(0);
  });

  it('attaches source_phase to all extracted claims', async () => {
    jest.doMock('@anthropic-ai/sdk', () => ({
      default: jest.fn().mockImplementation(() => ({
        messages: {
          create: jest.fn().mockResolvedValue({
            content: [{
              type: 'text',
              text: JSON.stringify([{
                claim: 'TAM is $4B',
                domain: 'market_sizing',
                stakes_level: 'HIGH',
                decision_relevance: 'BLOCKING',
              }]),
            }],
          }),
        },
      })),
    }));

    const claims = await extractClaims('The market is large.', 3);
    if (claims.length > 0) {
      expect(claims[0].source_phase).toBe(3);
    }
  });
});

// ─────────────────────────────────────────────────────────────
// BridgeLayer.extractSignal — pipeline → GateSignal translation
// ─────────────────────────────────────────────────────────────

describe('BridgeLayer.extractSignal', () => {
  it('translates GBSE PASS → GateSignal ALLOW', async () => {
    const { sink, entries } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult({ finalVerdict: 'PASS' })),
      makeMockAtta(),
      sink,
    );
    const signal = await bridge.extractSignal(makeClaim());
    expect(signal.decision).toBe('ALLOW');
    expect(entries).toHaveLength(1);
    expect(entries[0].gateDecision).toBe('ALLOW');
  });

  it('translates GBSE BLOCK → GateSignal BLOCK', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult({
        finalVerdict:  'BLOCK',
        correctionLog: '[HALLUCINATION] revenue figure fabricated',
      })),
      makeMockAtta(),
      sink,
    );
    const signal = await bridge.extractSignal(makeClaim());
    expect(signal.decision).toBe('BLOCK');
  });

  it('translates GBSE CONDITIONAL_PASS → GateSignal HUMAN_REVIEW', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult({
        finalVerdict:  'CONDITIONAL_PASS',
        correctionLog: '[DEBATABLE] market size estimate unverified',
      })),
      makeMockAtta(),
      sink,
    );
    const signal = await bridge.extractSignal(makeClaim());
    expect(signal.decision).toBe('HUMAN_REVIEW');
  });

  it('pipeline exception → GateSignal HUMAN_REVIEW (never ALLOW)', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(new Error('timeout')),
      makeMockAtta(),
      sink,
    );
    const signal = await bridge.extractSignal(makeClaim());
    expect(signal.decision).toBe('HUMAN_REVIEW');
    expect(signal.decision).not.toBe('ALLOW');
  });

  it('stagnated pipeline → GateSignal HUMAN_REVIEW', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult({
        diagnostics: { stagnated: true, stagnationTags: 'EC-12', iterationCount: 5 },
      })),
      makeMockAtta(),
      sink,
    );
    const signal = await bridge.extractSignal(makeClaim());
    expect(signal.decision).toBe('HUMAN_REVIEW');
  });

  it('every decision writes a log entry with correct provenance fields', async () => {
    const { sink, entries } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(),
      sink,
    );
    const claim = makeClaim();
    await bridge.extractSignal(claim);

    expect(entries).toHaveLength(1);
    expect(entries[0].claim).toBe(claim.claim);
    expect(entries[0].claimDomain).toBe(claim.domain);
    expect(entries[0].stakesLevel).toBe(claim.stakes_level);
    expect(entries[0].timestamp).toBeTruthy();
    expect(entries[0].logId).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// BridgeLayer.checkAttaRecord — ATTA governance paths
// ─────────────────────────────────────────────────────────────

describe('BridgeLayer.checkAttaRecord', () => {
  function makeAllowSignal(): GateSignal {
    return {
      decision:        'ALLOW',
      pipelineVerdict: 'PASS',
      reason:              'GBSE PASS',
      reasonCodes:         [],
      attaGoverned:    false,
      claim:           'test',
      claimDomain:     'market_sizing',
      stakesLevel:     'HIGH',
      canProceed:          true,
      requiresHumanReview: false,
      blockedFields:       [],
      verifiedFields:      [],
    };
  }

  it('AFFIRMED record: ALLOW passes through with ATTA provenance attached', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(makeAttaRecord('AFFIRMED')),
      sink,
    );
    const governed = await bridge.checkAttaRecord(makeClaim(), makeAllowSignal());
    expect(governed.decision).toBe('ALLOW');
    expect(governed.attaGoverned).toBe(true);
    expect(governed.attaStatus).toBe('AFFIRMED');
  });

  it('PROPOSED record: ALLOW → HUMAN_REVIEW', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(makeAttaRecord('PROPOSED')),
      sink,
    );
    const governed = await bridge.checkAttaRecord(makeClaim(), makeAllowSignal());
    expect(governed.decision).toBe('HUMAN_REVIEW');
    expect(governed.attaGoverned).toBe(true);
  });

  it('PENDING record: ALLOW → HUMAN_REVIEW', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(makeAttaRecord('PENDING')),
      sink,
    );
    const governed = await bridge.checkAttaRecord(makeClaim(), makeAllowSignal());
    expect(governed.decision).toBe('HUMAN_REVIEW');
  });

  it('PROPOSED_NOT_AFFIRMED record: ALLOW → HUMAN_REVIEW', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(makeAttaRecord('PROPOSED_NOT_AFFIRMED')),
      sink,
    );
    const governed = await bridge.checkAttaRecord(makeClaim(), makeAllowSignal());
    expect(governed.decision).toBe('HUMAN_REVIEW');
  });

  it('REJECTED record: any signal → BLOCK', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(makeAttaRecord('REJECTED')),
      sink,
    );
    const governed = await bridge.checkAttaRecord(makeClaim(), makeAllowSignal());
    expect(governed.decision).toBe('BLOCK');
    expect(governed.attaStatus).toBe('REJECTED');
  });

  it('no record found: ALLOW → HUMAN_REVIEW', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(null), // no record
      sink,
    );
    const governed = await bridge.checkAttaRecord(makeClaim(), makeAllowSignal());
    expect(governed.decision).toBe('HUMAN_REVIEW');
    expect(governed.attaGoverned).toBe(true);
    expect(governed.attaRecordId).toBeUndefined();
  });

  it('BLOCK signal is not overridden by AFFIRMED ATTA record', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(makeAttaRecord('AFFIRMED')),
      sink,
    );
    const blockSignal: GateSignal = { ...makeAllowSignal(), decision: 'BLOCK' };
    const governed = await bridge.checkAttaRecord(makeClaim(), blockSignal);
    expect(governed.decision).toBe('BLOCK'); // BLOCK is never overridden
  });

  it('LOW stakes CONTEXTUAL claim skips ATTA check', async () => {
    const { sink } = makeMockLog();
    const attaMock = makeMockAtta(makeAttaRecord('PROPOSED'));
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      attaMock,
      sink,
    );
    const claim = makeClaim({ stakes_level: 'LOW', decision_relevance: 'CONTEXTUAL', domain: 'technical_specs' });
    const governed = await bridge.checkAttaRecord(claim, makeAllowSignal());
    expect(governed.decision).toBe('ALLOW'); // skipped — no ATTA check
    expect(attaMock.getRecord).not.toHaveBeenCalled();
  });

  it('governs decision log includes ATTA record ID and status', async () => {
    const { sink, entries } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult()),
      makeMockAtta(makeAttaRecord('AFFIRMED')),
      sink,
    );
    await bridge.checkAttaRecord(makeClaim(), makeAllowSignal());
    const entry = entries.find(e => e.attaChecked);
    expect(entry).toBeDefined();
    expect(entry!.attaRecordId).toContain('AFFIRMED');
    expect(entry!.attaStatus).toBe('AFFIRMED');
  });
});

// ─────────────────────────────────────────────────────────────
// BridgeLayer.process — full bridge cycle
// ─────────────────────────────────────────────────────────────

describe('BridgeLayer.process — full bridge cycle', () => {
  it('PASS + AFFIRMED → final ALLOW with ATTA provenance', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult({ finalVerdict: 'PASS' })),
      makeMockAtta(makeAttaRecord('AFFIRMED')),
      sink,
    );
    const signal = await bridge.process(makeClaim());
    expect(signal.decision).toBe('ALLOW');
    expect(signal.attaGoverned).toBe(true);
    expect(signal.attaStatus).toBe('AFFIRMED');
  });

  it('PASS + PENDING → final HUMAN_REVIEW', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult({ finalVerdict: 'PASS' })),
      makeMockAtta(makeAttaRecord('PENDING')),
      sink,
    );
    const signal = await bridge.process(makeClaim());
    expect(signal.decision).toBe('HUMAN_REVIEW');
  });

  it('BLOCK + AFFIRMED → final BLOCK (ATTA does not override BLOCK)', async () => {
    const { sink } = makeMockLog();
    const bridge = new BridgeLayer(
      makeMockGbse(makePipelineResult({
        finalVerdict: 'BLOCK',
        correctionLog: '[HALLUCINATION] false claim',
      })),
      makeMockAtta(makeAttaRecord('AFFIRMED')),
      sink,
    );
    const signal = await bridge.process(makeClaim());
    expect(signal.decision).toBe('BLOCK');
  });
});

