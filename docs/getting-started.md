# Getting Started

## Installation

```bash
npm install bridgelayer
```

## Basic Usage

```js
import { BridgeLayer } from 'bridgelayer';

const bridge = new BridgeLayer({
  source: {
    type: 'postgres',
    url: 'postgres://user:pass@localhost:5432/mydb',
  },
  destination: {
    type: 'webhook',
    url: 'https://example.com/ingest',
  },
  retries: 3,
  timeout: 5000,
});

const result = await bridge.sync();
console.log(`Synced ${result.recordsProcessed} records in ${result.durationMs}ms`);
```

## Next Steps

- See [Configuration Reference](./configuration.md) for all available options.
- See [Writing a Custom Connector](./custom-connector.md) to integrate your own services.
