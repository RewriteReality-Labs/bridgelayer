# Getting Started

## Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- An Anthropic API key (for `extractClaims()` live runs)

## Installation

```bash
git clone https://github.com/RewriteReality-Labs/bridgelayer.git
cd bridgelayer
npm install
```

## Environment Setup

```bash
cp .env.example .env
# Edit .env and set ANTHROPIC_API_KEY
```

Required variables:

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Required for `extractClaims()`. Get from console.anthropic.com. |

## Verify the Install

```bash
# Type-check — must be zero errors
npx tsc --noEmit

# Run tests — expected: 39 passed, 4 skipped, 0 failed
npm test
```

The 4 skipped tests require the GBSE `src/index.js` prerequisite fix (`GBSE_INDEX_PREREQUISITE_CLAIM_001`). This is expected and documented.

## Basic Usage

```ts
import { extractClaims, triggerGate, stampBlueprint } from './src';

// 1. Extract claims from a phase input
const claims = await extractClaims(
  'Our target market is Pakistani SMEs in the COD logistics space,
   with a TAM of $2B annually.',
  3 // phase number
);

// 2. Run GBSE verification on each claim
const gateResults = await Promise.all(claims.map(triggerGate));

// 3. Stamp the Blueprint and get a build verdict
const blueprint = stampBlueprint(claims, gateResults);

console.log(blueprint.final_verdict);
// → 'BUILD_WITH_RISKS' | 'BUILD_CLEAR' | 'NEEDS_VALIDATION' | 'DO_NOT_BUILD'
```

## Using the BridgeLayer Class (Full ATTA Governance)

```ts
import { BridgeLayer } from './src';
import type { GbsePipeline, AttaStore, DecisionLogSink } from './src';

// Implement or mock the three dependencies
const gbse: GbsePipeline = { /* your GBSE adapter */ };
const atta: AttaStore = { /* your ATTA record store */ };
const log: DecisionLogSink = { /* your log sink */ };

const bridge = new BridgeLayer(gbse, atta, log);

// Full governed cycle: extractSignal → checkAttaRecord → GateDecisionLog
const signal = await bridge.process(claim);

console.log(signal.decision);       // 'ALLOW' | 'BLOCK' | 'HUMAN_REVIEW'
console.log(signal.canProceed);     // boolean
console.log(signal.attaGoverned);   // boolean
console.log(signal.attaStatus);     // 'AFFIRMED' | 'PENDING' | etc.
```

## What to Read Next

- [Architecture](./architecture.md) — how the three systems connect *(planned)*
- [CHANGELOG](../CHANGELOG.md) — what is confirmed delivered
- [CONTRIBUTING](../CONTRIBUTING.md) — how to make changes
