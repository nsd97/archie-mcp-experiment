# Archie Operations Center Project Overview

## 1. High-Level Picture

- **Goal**: Prototype the Archie Operations Center experience so Ops teams can triage listings and stray work while the production AWS backend is built.
- **Shape**: Vite/React front-end + local Express mock API. The mock server mirrors the eventual DynamoDB/SQS/Cognito contract outlined in `docs/backend/technical-design.md` so the UI can iterate against the right shapes now.
- **Primary entry point**: `/operations-center` renders the entire Ops Center interface backed by data fetched from the mock API (`GET /v1/operations/state`).

## 2. Mock API (mock-server/)

### 2.1 Server basics
- **Location**: `mock-server/server.js`
- **Start command**: `npm run mock-server`
- **Port**: 8080 (default)
- **Data store**: In-memory JS objects created via `mock-server/operations-data.js`; request handlers update the store through helper functions in `mock-server/operations-store.js`.

### 2.2 Dataset
- `mock-server/operations-data.js` builds the initial state: agents, playbooks, listings, tasks, notes, attachments, history, and work-item groupings.
- Task templates live in `mock-server/category-templates.js`; the helper `instantiateCategoryForListing()` creates per-listing tasks + work-item metadata.

### 2.3 REST endpoints
All endpoints sit under `/v1`. Payloads return `{ data: <OperationsState> }` so the frontend can replace its snapshot after each mutation.

| Method & Path | Description |
| --- | --- |
| `GET /operations/state` | Return the full operations snapshot (listings, tasks, agents, notes, attachments, work items). |
| `POST /operations/reset` | Reset the store to fresh seed data. |
| `POST /operations/listings/:listingId/status` | Update a listing status and append a history event. |
| `POST /operations/listings/:listingId/notes` | Add a note + history entry. |
| `POST /operations/tasks/:taskId/claim` | Claim a task (updates `claimedById`, status, history). |
| `POST /operations/tasks/:taskId/unclaim` | Unclaim a task. |
| `POST /operations/tasks/:taskId/done` | Mark a task as done. |
| `POST /operations/tasks/:taskId/defer` | Defer due date by `days`. |
| `POST /operations/tasks/:taskId/queue` | Move stray task between queues. |
| `POST /operations/tasks/:taskId/outputs` | Update a single output field. |
| `POST /operations/tasks/:taskId/status` | Directly set the task status. |
| `GET /tasks/:taskId/ui` | Example task-screen definition (legacy demo). |

These routes reflect the eventual AWS contract (see `docs/backend/technical-design.md`).

## 3. Front-End Architecture

### 3.1 Data layer
- `src/components/operations-center/state.tsx` defines `OperationsProvider`.
  - On mount, `fetchOperationsState()` (`src/components/operations-center/api.ts`) hits the mock API and seeds context state.
  - Each UI action (claim task, add note, etc.) calls an API helper and then replaces the local snapshot with the returned payload.
  - Context exposes `isLoading`, `refresh`, and strongly typed action methods so components do not manage fetch logic directly.

### 3.2 Key UI modules
- `OperationsCenter` (`src/components/operations-center/OperationsCenter.tsx`): Sets up tabs and modals, wires the context with internal state for selected listing/task.
- Views under `src/components/operations-center/views/`:
  - `ListingsBoard.tsx`: Kanban columns (New / In Progress / Done/Posted) using drag-and-drop + completeness badges.
  - `ListingsQueue.tsx`: Table-style queue view of tasks filtered by listing.
  - `MyTasksView.tsx`: Uses context data to list tasks claimed by the current user.
  - `StrayQueuesBoard.tsx`: Two-column board for Admin vs Marketing stray tasks.
  - `ListingDetail.tsx`: Right-hand pane with listing tasks, note composer, attachments, history timeline.
  - `TaskDetail` components: Modal view with inputs/outputs editing (driven by template metadata).
- Shared helpers
  - `templates.ts`: Task template definitions (mirrors the mock server categories).
  - `validation.ts`: Functions such as `getListingCompleteness` for UI badges.
  - `types.ts`: All context data types (agents, listings, tasks, work items).

### 3.3 Styling & Components
- UI uses shadcn/ui components with Tailwind classes defined in `src/index.css` + `App.css`.
- Lucide icons, Radix primitives, and custom CSS classes provide consistent look and feel.

### 3.4 Component library system
- The design system lives in `src/components/ui/`. Each file exports a typed React component or hook that wraps the corresponding Shadcn/Radix primitive (e.g., `button.tsx`, `card.tsx`, `tabs.tsx`).
- These UI primitives are consumed across the Ops Center views to ensure consistent styling and behavior. For example, `ListingsBoard` pulls in `Card` and `ScrollArea`, while modals and dialogs reuse `dialog.tsx` and `sheet.tsx`.
- Utility hooks such as `use-toast.ts` are colocated in the same folder, giving a single import surface (`@/components/ui/...`) for all shared UI behaviors.
- Any new UI surface should compose these primitives instead of re-implementing styling, keeping the front-end aligned with the design tokens and easing future theming.

### 3.5 Tasks & Screens library
- Resides in `src/lib/tasks/` and is exported via `@/lib/tasks`. `core.ts` defines the type system (`defineTask`, `bind`, `path`, and all compile-time validation helpers).
- `defaultComponents.tsx` registers the default input/output renderers against the registry. Inputs wire into `react-hook-form` fields; outputs lean on markdown/json/table/badge helpers with CSS-variable theming (`styles.css`).
- `TaskRenderer.tsx` drives runtime rendering: evaluates `visibleWhen`, resolves data sources via provider registry, streams updates back through the supplied `onValueChange` callback, and executes strongly typed actions with toast feedback.
- `src/lib/tasks/definitions.ts` converts the WorkItem templates into first-class Task definitions (marketing vs admin departments, per-task `TaskGroup` IDs, resources markdown). These definitions are consumed by `TaskDetail` to hydrate screens for every templated Task.
- Compile-time enforcement catches duplicate bindings, missing data sources, invalid visibility clauses, and payload references before runtime. Authors only compose JSON-like configs—no generics or string templating required.
- Example authoring (see `definitions.ts`):

```ts
export const uploadLeads = defineTask({
  version: 1,
  id: "task-upload-leads",
  name: "Upload Leads CSV",
  department: "marketing",
  order: 0,
  screen: {
    id: "scr-upload",
    layout: { kind: "grid", columns: "1fr 1fr" },
    components: [
      { id: "file", kind: "input", type: "file", binding: "file", label: "CSV", required: true },
      { id: "preview", kind: "output", type: "table", binding: "preview" },
      { id: "notes", kind: "input", type: "text", binding: "notes", config: { multiline: true }, label: "Notes" },
    ] as const,
  },
});
```

## 4. Build & Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Launch Vite dev server (front-end). |
| `npm run mock-server` | Launch Express mock API. |
| `npm run build` | Production bundle. |
| `npm run preview` | Preview built bundle. |
| `npm run generate:task-md` | Export every task in the mock dataset as Markdown (`docs/tasks/`). |
| `npm run concat:task-md` | Concatenate task Markdown into `docs/tasks.md`. |

## 5. Upcoming Migration Targets

- Swap mock API for real AWS stack that follows `docs/backend/technical-design.md` (DynamoDB tables, SQS intake, Cognito auth, S3 documents).
- Harden data shape alignment: the mock server already emits the aggregated snapshot the UI expects; once the real API exposes equivalent routes, the front-end will only need endpoint URLs and auth tokens updated.

## 6. Contact & Ownership

- Reach out to the Archie Ops Center engineering team for questions on roadmap or backend implementation details.
- Front-end conventions, template schemas, and mock data live in this repository for easy reference during development.
