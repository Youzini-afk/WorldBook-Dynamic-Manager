# WBM v3 Skeleton

This folder is the v3 migration target with a modular layout aligned to Tavern Helper template conventions.

## Structure

- `core/`: shared types and configuration.
- `infra/`: logger and event subscription lifecycle.
- `services/`: parser/patch/router/scheduler/review/worldbook.
- `ui/`: panel controller abstractions.
- `index.ts`: composition root (`bootstrapWbmV3`).

## Migration Rule

1. New code is added here.
2. Legacy behavior remains in `index.js` until v3 parity is completed.
3. Once parity is confirmed, the legacy file can be replaced by the v3 bundle.
