# Test Matrix

## Unit Tests (v3)

### Parser

1. Accept valid `<world_update>` with array payload.
2. Reject payload without required fields (`action`, `entry_name`).
3. Reject unsupported action.
4. Handle malformed JSON gracefully.

### PatchProcessor

1. Content operations: append/prepend/insert_before/insert_after/replace/remove.
2. Field operations: set allowed fields only.
3. Key operations: add/remove primary and secondary keys.
4. Duplicate guard behavior.

### Scheduler

1. `isDue` across start/interval boundaries.
2. `nextDue` for interval `0`, positive interval, and disabled interval.
3. No double execution when lock is held.

### Router

1. Success path for all four actions.
2. Skip path when target is missing.
3. Queue path under manual/selective approval mode.
4. Error propagation without global crash.

## Integration Tests (v3)

1. Target worldbook resolution in all modes.
2. Approval queue and command replay.
3. Snapshot rollback after message deletion.
4. Chat switch state reset and event rebind.
5. External and main API review path.

## Manual Exploratory

1. 7-tab panel behavior and actions.
2. Long-running chat (high floor count) with no repeated updates.
3. Managed mode auto-book creation/binding with empty chat binding.
