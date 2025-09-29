# Setup and local development

This project is a plain TypeScript React app with Vite, plus a local Express mock API. No databases or secrets are required.

### Requirements

- Node.js 18+
- npm 9+

### Environment variables

| Name | Required | Default | Used In | What it does |
| --- | --- | --- | --- | --- |
| VITE_OPERATIONS_API_URL | false | `http://localhost:8080/v1` | `src/components/operations-center/api.ts` | Base URL for the mock Operations API. |

How to override in development:

```bash
# macOS/Linux
export VITE_OPERATIONS_API_URL="http://localhost:8080/v1"
npm run dev
```

### Quickstart

```bash
npm install
npm run mock-server     # starts Express mock API on :8080
npm run dev             # starts Vite dev server (default :5173)
```

Open the app at `http://localhost:5173`. The API is at `http://localhost:8080`.

### Build & preview

```bash
npm run build
npm run preview         # starts Vite preview server (can bind :8080)
```

Note: `vite.config.ts` configures host and may bind to port 8080 for preview; your dev server typically uses :5173.

### Common errors and fixes

- Port already in use: Stop the other process or change the port (e.g., `PORT=5174 npm run dev`).
- CORS errors: Ensure the mock server is running on :8080; the server enables CORS.
- Missing env: The app falls back to `http://localhost:8080/v1` if `VITE_OPERATIONS_API_URL` is not provided.
