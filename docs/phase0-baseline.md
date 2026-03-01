# Phase 0 Baseline (Frozen)

This document freezes the current behavior before the v3 migration.

## Feature Matrix

| Area | Current Capability | Owner Module |
|---|---|---|
| Triggering | before/after/both trigger timing | `Sched`, `EventBridge` |
| Command parsing | `<world_update>` tag + JSON payload | `Parser` |
| Command execution | create/update/delete/patch | `Router` + `PatchProcessor` |
| Target book resolution | char primary/additional/global/managed | `Book.getTargetBookName` |
| Storage | localStorage config/api/log/presets/snapshots | `Store` |
| Safety | delete confirm, approval queue, snapshot rollback | `Router`, `PendingQueue`, `SnapshotStore` |
| UI | floating panel, extension menu, 7 tabs | `UI` |
| APIs | `window.WBM`, `window.WorldBookManager` | `PublicAPI` |

## Known Risk List (Pre-v3)

1. Single-file architecture with mixed concerns (UI + data + scheduler + adapters).
2. High coupling with global runtime state (`RT`) and implicit browser globals.
3. Event duplication risk between observer and event bridge.
4. Legacy compatibility branches around worldbook backend behavior.

## Baseline Success Criteria

1. Every v3 milestone can be validated against this matrix.
2. Any feature drop must be explicitly recorded in release notes.
3. Manual regression checklist is mandatory per release candidate.
