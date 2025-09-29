// Minimal in-memory operations store compatible with frontend Operations API
// Provides pure functions to read/mutate the OperationsData snapshot.
// NOTE: This module intentionally avoids external state beyond this file.

const initialState = {
  agents: [
    { id: "agent-noah", name: "Noah", email: "noah@example.com" },
    { id: "agent-jane", name: "Jane Agent", email: "jane@example.com" },
  ],
  playbooks: [],
  listings: [
    { id: "lst-1", address: "123 Main St", status: "NEW", agentId: "agent-noah", dueDate: new Date().toISOString(), dealType: "Sale", propertyType: "House", squareFootage: 1800, location: "Toronto" },
    // Long-horizon examples (> 7 days out)
    { id: "lst-2", address: "456 Oak Ave", status: "NEW", agentId: "agent-jane", dueDate: new Date(Date.now()+14*86400000).toISOString(), dealType: "Sale", propertyType: "Condo", squareFootage: 900, location: "Toronto" },
    { id: "lst-3", address: "789 Pine Rd", status: "IN_PROGRESS", agentId: "agent-noah", dueDate: new Date(Date.now()+30*86400000).toISOString(), dealType: "Lease", propertyType: "Townhouse", squareFootage: 1400, location: "Mississauga" },
  ],
  tasks: [
    { id: "tsk-1", title: "Draft MLS & Cornerstone listing", listingId: "lst-1", status: "NEW", dueDate: new Date(Date.now()+86400000).toISOString(), claimedById: undefined, urgencyScore: 70, type: "COPYWRITING", templateKey: "sale-active-draft-mls", inputs: {}, outputs: {} },
    { id: "tsk-2", title: "Book photography", listingId: "lst-1", status: "IN_PROGRESS", dueDate: new Date(Date.now()+2*86400000).toISOString(), claimedById: "agent-noah", urgencyScore: 80, type: "OTHER", templateKey: "sale-active-book-photos", inputs: {}, outputs: {} },
    // Long-horizon tasks for lst-2 (10 and 21 days out)
    { id: "tsk-3", title: "Prepare seller documents", listingId: "lst-2", status: "NEW", dueDate: new Date(Date.now()+10*86400000).toISOString(), claimedById: undefined, urgencyScore: 40, type: "DOCS", templateKey: "sale-active-draft-mls", inputs: {}, outputs: {} },
    { id: "tsk-4", title: "Schedule staging", listingId: "lst-2", status: "NEW", dueDate: new Date(Date.now()+21*86400000).toISOString(), claimedById: undefined, urgencyScore: 30, type: "OTHER", templateKey: "sale-active-book-photos", inputs: {}, outputs: {} },
    // Long-horizon tasks for lst-3 (15 and 28 days out)
    { id: "tsk-5", title: "Tenant screening", listingId: "lst-3", status: "IN_PROGRESS", dueDate: new Date(Date.now()+15*86400000).toISOString(), claimedById: "agent-noah", urgencyScore: 50, type: "REVIEW", templateKey: "lease-active-screening", inputs: {}, outputs: {} },
    { id: "tsk-6", title: "Lease paperwork prep", listingId: "lst-3", status: "NEW", dueDate: new Date(Date.now()+28*86400000).toISOString(), claimedById: undefined, urgencyScore: 35, type: "DOCS", templateKey: "lease-active-paperwork", inputs: {}, outputs: {} },
  ],
  notes: [],
  attachments: [],
  history: [],
  workItems: [
    { id: "wi-lst-1-active", type: "SALES_LISTING_ACTIVE", title: "123 Main St — active", listingId: "lst-1", taskIds: ["tsk-1", "tsk-2"] },
    { id: "wi-lst-2-active", type: "SALES_LISTING_ACTIVE", title: "456 Oak Ave — active", listingId: "lst-2", taskIds: ["tsk-3", "tsk-4"] },
    { id: "wi-lst-3-lease", type: "LEASE_LISTING_ACTIVE", title: "789 Pine Rd — active", listingId: "lst-3", taskIds: ["tsk-5", "tsk-6"] },
  ],
};

function clone(v) { return JSON.parse(JSON.stringify(v)); }

let state = clone(initialState);

function getState() { return clone(state); }
function resetState() { state = clone(initialState); return getState(); }

// Listing status change (used by Listings board)
function updateListingStatus(listingId, status) {
  state.listings = state.listings.map(l => l.id === listingId ? { ...l, status } : l);
  return getState();
}

// Claim task for agent; NEW → IN_PROGRESS (unless already DONE)
function claimTask(taskId, agentId) {
  state.tasks = state.tasks.map(t => t.id === taskId ? { ...t, claimedById: agentId, status: t.status === "NEW" ? "IN_PROGRESS" : t.status } : t);
  return getState();
}

// Unclaim task; if not DONE, revert to NEW
function unclaimTask(taskId) {
  state.tasks = state.tasks.map(t => t.id === taskId ? { ...t, claimedById: undefined, status: t.status === "DONE" ? t.status : "NEW" } : t);
  return getState();
}

function markTaskDone(taskId) {
  state.tasks = state.tasks.map(t => t.id === taskId ? { ...t, status: "DONE" } : t);
  return getState();
}

// Push due date by N days
function deferTask(taskId, days) {
  state.tasks = state.tasks.map(t => t.id === taskId ? { ...t, dueDate: new Date(new Date(t.dueDate).getTime() + days*86400000).toISOString() } : t);
  return getState();
}

// Append a note and keep history minimal
function addNote(listingId, authorId, body) {
  state.notes.push({ id: `note-${Date.now()}`, listingId, authorId, createdAt: new Date().toISOString(), body });
  return getState();
}

function moveStrayTaskToQueue(taskId, queue) {
  state.tasks = state.tasks.map(t => t.id === taskId ? { ...t, queue } : t);
  return getState();
}

// Update one output field (stringified to keep UI simple)
function updateTaskOutput(taskId, key, value) {
  state.tasks = state.tasks.map(t => t.id === taskId ? { ...t, outputs: { ...(t.outputs || {}), [key]: String(value ?? "") } } : t);
  return getState();
}

function updateTaskStatus(taskId, status) {
  state.tasks = state.tasks.map(t => t.id === taskId ? { ...t, status } : t);
  return getState();
}

module.exports = {
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
};
