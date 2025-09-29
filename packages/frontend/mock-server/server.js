/**
 * DEPRECATED - DO NOT USE
 * This legacy mock server is retained for reference only. The real backend API
 * is available on http://localhost:3000.
 *
 * If you need to run the app locally, use the Vite proxy to `/v1` instead of
 * this server. See packages/frontend/vite.config.ts.
 */

// The entire implementation below is intentionally commented out to prevent
// accidental usage. Leave this file in the repo for historical reference.

/*
// Mock API server for Operations Center
// Express app exposing REST endpoints that mutate an in-memory store and
// always return a full { data: OperationsData } snapshot. CORS enabled for local dev.
const express = require('express');
const cors = require('cors');

const {
  getState,
  resetState,
  updateListingStatus,
  claimTask,
  unclaimTask,
  markTaskDone,
  deferTask,
  addNote,
  moveStrayTaskToQueue,
  updateTaskOutput,
  updateTaskStatus,
} = require('./operations-store');

const app = express();
const port = 8080;

app.use(cors());
app.use(express.json());

// ... original endpoints elided ...

app.listen(port, () => {
  console.log(`🚀 Archie Mock API Server listening at http://localhost:${port}`);
});
*/

console.warn('[DEPRECATED] The mock server is disabled. Use the real backend at http://localhost:3000 and Vite proxy to /v1.');
