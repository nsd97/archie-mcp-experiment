## Code tour (clickable walkthrough)

Follow this path to see the main flow end-to-end.

1) Bootstrap and routes

- Open `src/main.tsx` → then `src/App.tsx`
- Notice providers (React Query) and routes mounting the Operations Center page.

2) Operations Center shell and views

- Open `src/components/operations-center/OperationsCenter.tsx`
- Notice `OperationsProvider` wraps the shell, exposing `ops`.
- The tabs switch between: listings, stray queues, my tasks, and listing detail.

3) Listings board and queue

- Open `src/components/operations-center/views/ListingsBoard.tsx`
- Notice precomputed maps and `onDrop` that calls `ops.updateListingStatus`.
- Open `src/components/operations-center/views/ListingsQueue.tsx`
- Notice how tasks are grouped by listing and Claim posts to the API via `ops.claimTask`.

4) Listing modal and Task detail

- Open `src/components/operations-center/views/ListingTasksModal.tsx`
- Notice sorting rules and claim/unclaim buttons.
- Open `src/components/operations-center/views/TaskDetail.tsx`
- See how it merges inputs/outputs and calls `ops.updateTaskOutput` on change.

5) Provider and API client

- Open `src/components/operations-center/state.tsx`
- Notice each action calls the API and replaces the snapshot.
- Open `src/components/operations-center/api.ts`
- The client now talks to the real Ops Center backend (`VITE_OPERATIONS_API_URL`), stitching together listings, tasks, queues, and board data into the legacy snapshot. If those endpoints are unavailable it falls back to the legacy `/operations/state` mock.

6) Backend integration

- Point the frontend at your Dockerised service via `VITE_OPERATIONS_API_URL` and `VITE_OPERATIONS_USER_ID`.
- Legacy support: run `npm run mock-server` if you still need the in-memory API. The UI will automatically fall back for read operations, though mutations use the new contract.

7) Tasks & Screens renderer (for future richer UIs)

- Open `src/lib/tasks/TaskRenderer.tsx` and `src/lib/tasks/registry.tsx`
- Components, data sources, transforms, and actions are registered in a simple registry.
- Authoring types live in `src/lib/tasks/core.ts` and `src/lib/tasks/definitions.ts`.

Next: read [api.md](./api.md) for the endpoints and [extending.md](./extending.md) to add a new task.
