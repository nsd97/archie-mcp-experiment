## FAQ

Q: How do I run the app locally?
A: See [setup.md](./setup.md). In short: `npm install`, `npm run mock-server`, `npm run dev`.

Q: Where are the REST endpoints?
A: Listed in [api.md](./api.md). Implemented in `mock-server/server.js`.

Q: What port does the app use?
A: Dev uses :5173 by default (Vite). Preview often uses :8080. Mock API uses :8080.

Q: How does the UI load data?
A: It calls `GET /v1/operations/state` and stores the snapshot in `OperationsProvider`.

Q: What happens when I click Claim?
A: UI calls `POST /v1/operations/tasks/:id/claim` then replaces the snapshot from the response.

Q: Where are types defined?
A: `src/components/operations-center/types.ts`.

Q: Where does state live in the browser?
A: In React state inside `OperationsProvider`. No Redux or global store.

Q: How are outputs saved?
A: Each change posts to `POST /v1/operations/tasks/:id/outputs` with `{key,value}`.

Q: How do I mark a task done?
A: Click Mark Done. It calls `POST /v1/operations/tasks/:id/done`.

Q: Can I drag tasks between columns?
A: Yes in My Tasks board (NEW/IN_PROGRESS/DONE). It calls `/status` under the hood.

Q: Can I drag listings between columns?
A: Yes in the Listings board (NEW/IN_PROGRESS/DONE_POSTED). It calls the listing status endpoint.

Q: Where do the task templates come from?
A: `shared/category-templates.json` → consumed by both mock data and frontend.

Q: What is the Tasks & Screens renderer?
A: A small engine to render inputs/outputs from definitions. See `src/lib/tasks`.

Q: Any auth?
A: Demo-only via `AuthContext`. No server enforcement.

Q: How do I change the API base URL?
A: Set `VITE_OPERATIONS_API_URL` before running `npm run dev`. See [setup.md](./setup.md).

Q: Is there testing set up?
A: TODO(clarify): No test scripts are present. Add Vitest if needed.

Q: Production deploy instructions?
A: Not included. This repo targets local development. See future TODOs in PR description.
