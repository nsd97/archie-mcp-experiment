# Architecture Simplification Summary

This iteration simplifies the prototype to reduce moving parts, cut duplication, and make the code easier to reason about while keeping all existing functionality.

## What changed

- Shared template catalog
  - Added `shared/category-templates.json` as the single source of truth for task templates.
  - Frontend `src/components/operations-center/templates.ts` now imports this JSON.
  - Mock server `mock-server/category-templates.js` now requires the same JSON.

- Simpler task UI
  - Replaced the dynamic `@/lib/tasks` framework usage in `TaskDetail` with a lightweight `SimpleTaskForm` component that renders outputs from the shared catalog.
  - Files touched: `src/components/operations-center/views/TaskDetail.tsx`, `src/components/operations-center/SimpleTaskForm.tsx`.

- Reusable board
  - Introduced a generic `Board` component: `src/components/operations-center/Board.tsx`.
  - Refactored `ListingsBoard` and `MyTasksBoard` to use `Board` (less drag-and-drop boilerplate).

- Decoupled state from views
  - `OperationsCenter` now passes an `ops: OperationsState` prop to views.
  - Updated: `ListingsView`, `ListingsBoard`, `ListingsQueue`, `MyTasksView`, `StrayQueuesBoard`, `ListingDetail`, `TaskDetailModal`, `TaskDetail`.

## Why this is better

- Single source of truth
  - Eliminates template drift between frontend and mock server; future backend can serve the same JSON.

- Less complexity, more clarity
  - `SimpleTaskForm` is straightforward. You can see what renders without jumping across registries and runtime eval.

- Reuse over repetition
  - One `Board` component handles columns, scrolling, and drag-and-drop, reducing repeated code and potential bugs.

- Easier to test and migrate
  - Passing `ops` via props makes components pure and testable. Swapping the data layer for the real API is simpler.

## Trade-offs and when to undo

- Lost dynamic UI engine
  - If you need highly dynamic, conditional screen definitions (form schemas with transforms/actions), consider restoring the `@/lib/tasks` renderer and definitions pipeline for those tasks.

- `SimpleTaskForm` is intentionally minimal
  - It covers common text/checkbox/upload cases. If richer widgets or complex validation flows are needed, you may:
    - Extend `SimpleTaskForm` per field kind, or
    - Reintroduce the prior renderer for specific tasks only.

- Prop-drilling `ops`
  - Explicitness is good, but it’s noisier. If preferred, create thin hooks or localized providers per view to reduce prop width without reintroducing hidden global coupling.

## Operational impact

- No API contract changes.
- No data migrations.
- Lints pass on updated files.

## Rollback guidance

- Dynamic renderer
  - Revert `TaskDetail.tsx` to import `TaskRenderer` and `getTaskDefinition` from `@/lib/tasks` and remove `SimpleTaskForm` usage.
  - Restore `src/lib/tasks/definitions.ts` as the source for screen definitions if needed.

- Template source
  - If you prefer TypeScript constants instead of JSON, point `templates.ts` back to inline templates and `mock-server` to its local object. Keep in mind the risk of drift.

- Boards
  - If the generic `Board` doesn’t fit a special case, inline a custom column layout in that view only and keep `Board` for everything else.

---

Net effect: simpler, smaller, and clearer. If a future requirement demands dynamic schema-driven screens, reintroduce the renderer selectively rather than everywhere.
