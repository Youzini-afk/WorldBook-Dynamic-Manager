# Release Playbook

## v2.1 (Stabilization Patch)

Scope:

1. Critical bug fixes only.
2. No architectural migration.
3. Keep runtime behavior stable.

Gate:

1. All checklist items in `docs/regression-checklist.md` pass.
2. No syntax/runtime regression in `index.js`.

## v3.0 (Deep Alignment)

Scope:

1. Modular TypeScript architecture under `src/WBM`.
2. Official worldbook API-first repository layer.
3. Lifecycle/event cleanup and testable services.

Gate:

1. Unit/integration tests from `docs/test-matrix.md` pass.
2. Feature parity validated against `docs/phase0-baseline.md`.
3. Release notes list intentional behavior changes.

## Rollback

1. Keep separate release tags for `v2.1` and `v3.0`.
2. If `v3.0` blocks production use, roll back to `v2.1`.
3. Do not overwrite artifacts between release lines.
