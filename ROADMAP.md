# BridgeLayer — ROADMAP

**Owner:** RewriteReality Labs · ATTA
**Governance:** GBSE Repository Governance Process v3.2
**Master claim:** `GBSE_BUILDGATE_BRIDGELAYER_MASTER_CLAIM_001`
**Last updated:** 2026-06-07

---

## Completion Score

| Stage | Score | Status |
|-------|-------|--------|
| Repo alignment | 85–90% | `SCAFFOLD_RECOVERED` |
| Implementation validation | 0% | `PENDING` |
| Release readiness | 0% | `BLOCKED` |
| **Overall** | **~72%** | `CONDITIONAL` |

Completion score advances only after: code merged on branch, tests passing, docs updated, milestone AFFIRMED.

---

## Milestone Ledger

---

### M-00 — Baseline Scaffold
**Status:** `AFFIRMED`
**Branch:** `main` (direct — pre-governance)
**Commit:** `105ed0c`
**Date:** 2026-06-07
**Delivered:**
- Repo structure: src/, tests/, docs/, .github/, scripts/, examples/
- CI/CD: ci.yml (Node 18/20/22), release.yml
- License, Contributing, Code of Conduct, Security
- package.json, tsconfig.json, .gitignore

**GBSE verdict:** CONDITIONAL_PASS · 83/100 (GBSE_BRIDGELAYER_REPO_CLAIM_001)

---

### M-01 — Schema Contracts + ATTA Governance
**Status:** `AFFIRMED`
**Branch:** `main` (direct — pre-governance)
**Commit:** `6e5ca42`
**Date:** 2026-06-07
**Delivered:**
- Canonical type definitions: Claim, RawBlueprint, StampedBlueprint, GateSignal, GateDecisionLog
- BUG-01 through BUG-05 all active
- ATTA governance: canSkipAttaCheck(), ATTA_MANDATORY_DOMAINS, AFFIRMED semantics
- normaliseClaim() backward-compat migration
- 39 tests passing · 4 skipped · 0 failing
- BlueprintGrade merge fix (ASSUMED yields to VERIFIED)

**GBSE verdict:** CONDITIONAL_PASS · 92–94/100

---

### M-02 — Governance File Alignment
**Status:** `AFFIRMED`
**Branch:** `main`
**Date:** 2026-06-07
**Delivered:**
- README corrected: no overclaims, confirmed architecture, ATTA status declared
- CHANGELOG corrected: confirmed deliverables only, exclusion list explicit
- CONTRIBUTING: ATTA-aligned, architecture-enforcing, branch governance documented
- SECURITY: scope correct, placeholder email clearly marked
- docs/README: no dead links
- docs/getting-started: accurate usage, no phantom docs linked
- .env.example: ANTHROPIC_API_KEY + token budget optionals
- CODEOWNERS: placeholder markers
- scripts/run-pipeline.js: manual execution entry point
- examples/: sample-input.json + expected-output.json (KhaasFlow COD)
- ROADMAP.md: this file

**GBSE verdict:** Targeting 92–94 → 95+ on governance dimensions

---

### M-03 — GBSE src/index.js Prerequisite Fix
**Status:** `BLOCKED`
**Blocked by:** `GBSE_INDEX_PREREQUISITE_CLAIM_001`
**Required action:** Confirm `runPipeline()` in GBSE `src/index.js` exposes `stagnated`, `stagnationTags`, `iterationCount` in return object
**Deliverable:** Replace `src/index.js` stub with real GBSE adapter
**Unlocks:** 4 skipped tests unskip → 43/43 passing

**Validation gates:**
```powershell
Select-String -Path "src/index.js" -Pattern "stagnated|stagnationTags|iterationCount" | Select-Object -First 10
npm test   # target: 43 passed · 0 skipped · 0 failed
```

---

### M-04 — BuildGate Integration Wiring
**Status:** `PLANNED`
**Dependency:** M-03 must be AFFIRMED
**Scope:**
- BuildGate phase handlers call `extractClaimsFromPhase()` from `pipeline-1.ts`
- `buildBridgeFeed()` produces typed input for BridgeLayer
- End-to-end: Phase 6 RawBlueprint → BridgeLayer → GateSignal → BuildGate verdict

**Validation gates:**
- End-to-end test: Phase 3 input → GBSE pipeline → StampedBlueprint verdict
- All claim domains round-trip through DOMAIN_TO_FIELD

---

### M-05 — Persistent AttaStore Implementation
**Status:** `PLANNED`
**Dependency:** M-03 must be AFFIRMED
**Scope:**
- Implement `AttaStore` interface against a real datastore (KV or DB)
- GateDecisionLog → AttaRecord promotion path
- ATTA record lifecycle: PROPOSED → PENDING → AFFIRMED / REJECTED

---

### M-06 — Benchmark Definition
**Status:** `PLANNED`
**Dependency:** M-03 must be AFFIRMED
**Scope:**
- Define adversarial test suite (mirror GBSE benchmark pattern)
- `npm run benchmark` → `benchmark-results.json`
- Metrics: flag detection rate, silent hallucination rate, gate accuracy

---

### M-07 — docs/architecture.md
**Status:** `PLANNED`
**Dependency:** M-03 AFFIRMED (stagnation path confirmed)
**Scope:**
- Pipeline stage documentation
- RawBlueprint vs StampedBlueprint boundary
- ATTA governance mapping table
- GBSE PASS ≠ BuildGate ALLOW distinction

---

### M-08 — ATTA Whitepaper
**Status:** `PLANNED`
**Dependency:** M-05 AttaStore implemented
**Scope:**
- Public-facing ATTA governance documentation
- Claim class taxonomy
- Proof sequence: PROPOSED → PENDING → AFFIRMED
- Enterprise compliance framing

---

### M-09 — v0.1.0 Release Tag
**Status:** `BLOCKED`
**Blocked by:** M-03 + M-06 must be AFFIRMED
**Required before tag:**
- 43/43 tests passing
- npm run lint clean
- End-to-end example confirmed
- CHANGELOG v0.1.0 entry finalized
- No open HARD BLOCK violations

---

## Risk / Deferral Log

| Risk ID | Risk | Impact | Status | Mitigation |
|---------|------|--------|--------|------------|
| R-01 | `src/index.js` stagnation fields unconfirmed | 4 tests permanently skipped | OPEN | Run Select-String locally, confirm or fix |
| R-02 | CODEOWNERS handle unconfirmed | No ownership mapping | OPEN | Confirm GitHub handle → populate |
| R-03 | Security contact email unconfirmed | SECURITY.md has placeholder | OPEN | Confirm email → populate both SECURITY.md and CODE_OF_CONDUCT.md |
| R-04 | Model string `claude-sonnet-4-20250514` deprecated | CI warning on extractClaims tests | OPEN | Update to `claude-sonnet-4-5` in src/bridge.ts |
| R-05 | Direct-to-main commits pre-governance | No PR history for M-00, M-01 | ACCEPTED | All future work on branches with PRs |
| R-06 | README badge URLs point to RewriteReality-Labs org | ✅ Correct after M-02 | RESOLVED | |

---

## Definition of Done

A milestone is DONE only when:
- [ ] Scope completed per milestone definition
- [ ] Tests pass (`npm test`)
- [ ] Type-check passes (`npx tsc --noEmit`)
- [ ] Docs updated if behavior changed
- [ ] ROADMAP.md updated with actual duration
- [ ] CHANGELOG.md updated with confirmed deliverable
- [ ] Branch cleared
- [ ] PR merged (for M-03 onward)
- [ ] ATTA status updated to AFFIRMED
