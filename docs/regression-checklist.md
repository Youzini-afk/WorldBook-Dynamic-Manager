# Regression Checklist

## Core Flow

1. Open panel from floating button and extension menu.
2. Select each target type (`charPrimary`, `charAdditional`, `global`, `managed`).
3. Manual review creates commands and executes successfully.
4. External mode receives valid response and writes to worldbook.
5. Inline mode strips `<world_update>` blocks from rendered message.

## Command Actions

1. `create` creates a new entry.
2. `update` updates existing content and metadata.
3. `delete` removes entry (with confirmation when enabled).
4. `patch` executes content operations and key operations.
5. Invalid/empty command payload is skipped without crash.

## Queue and Snapshot

1. Manual approval mode adds commands to queue.
2. Approve single command and approve all.
3. Reject single and reject all.
4. Delete message rollback restores worldbook snapshot when enabled.

## Chat/Session Behavior

1. Chat change resets transient runtime state.
2. No repeated double-trigger on a single AI message.
3. Managed mode uses or binds chat worldbook correctly.

## Stability

1. `uid = 0` entries can update/delete/toggle normally.
2. Unload path flushes logs and persists queue/snapshots.
3. No runtime error when calling `window.WBM.openUI()` / `closeUI()`.
