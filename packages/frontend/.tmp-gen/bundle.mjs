// src/components/operations-center/templates.ts
var categoryTemplates = {
  STRAY: [],
  SALES_LISTING_ACTIVE: [
    { key: "sale-active-prepare-paperwork", title: "Prepare listing paperwork and send for signature", defaultType: "DOCS" },
    { key: "sale-active-draft-mls", title: "Draft MLS & Cornerstone listing", defaultType: "COPYWRITING" },
    { key: "sale-active-configure-brokerbay", title: "Configure BrokerBay showing instructions & store screenshot", defaultType: "OTHER" },
    { key: "sale-active-book-photos", title: "Book photography", defaultType: "OTHER" },
    { key: "sale-active-arrange-sign-lockbox", title: "Arrange sign, lockbox & QR code installation", defaultType: "OTHER" },
    { key: "sale-active-post-live", title: "Post listing live on TRREB/Cornerstone", defaultType: "PUBLISH" },
    { key: "sale-active-send-media-kit", title: "Send media kit email", defaultType: "OTHER" }
  ],
  LEASE_LISTING_ACTIVE: [
    { key: "lease-active-update-sign-lockbox-sheet", title: "Update sign & lockbox spreadsheet", defaultType: "OTHER", resources: ["Listing folder", "Sign spreadsheet"], outputs: [{ key: "sheetUpdated", label: "Spreadsheet updated", kind: "checkbox" }] },
    { key: "lease-active-book-photos", title: "Book photos", defaultType: "OTHER", resources: ["Preferred photographer list"], outputs: [{ key: "when", label: "Photo date/time", kind: "text" }] },
    { key: "lease-active-create-notes", title: "Create property notes & description", defaultType: "COPYWRITING", resources: ["Questionnaire", "MPAC report"], outputs: [{ key: "notes", label: "Notes doc", kind: "upload" }] },
    { key: "lease-active-landlord-questionnaire", title: "Add landlord questionnaire & send link", defaultType: "DOCS", resources: ["Landlord questionnaire template"], outputs: [{ key: "link", label: "Questionnaire link", kind: "text" }] },
    { key: "lease-active-request-brokerbay", title: "Request BrokerBay instructions from agent", defaultType: "OTHER", resources: ["Agent contact"], outputs: [{ key: "instructions", label: "Instructions received", kind: "checkbox" }] },
    { key: "lease-active-post-live", title: "Post listing live on TRREB", defaultType: "PUBLISH", resources: ["Draft MLS"], outputs: [{ key: "posted", label: "Posted", kind: "checkbox" }] }
  ],
  SALE_LISTING_CLOSING: [
    { key: "sale-closing-move-folder", title: "Move listing folder to Closed Deals", defaultType: "OTHER" },
    { key: "sale-closing-legal-package", title: "Send lawyer email package", defaultType: "DOCS" },
    { key: "sale-closing-final-congrats", title: "Send final congratulations email after closing", defaultType: "OTHER" },
    { key: "sale-closing-review-skyslope", title: "Review Skyslope for closing completeness", defaultType: "REVIEW" },
    { key: "sale-closing-two-weeks-before", title: "Send two-weeks-before closing emails", defaultType: "OTHER" }
  ],
  SALE_LISTING_SOLD: [
    { key: "sale-sold-switch-conditional", title: "Switch conditional tab to firm", defaultType: "OTHER" },
    { key: "sale-sold-email-lawyer-info", title: "Email co\u2011op agent requesting buyer\u2019s lawyer info", defaultType: "OTHER" },
    { key: "sale-sold-deposit-docs", title: "Send deposit documents to deals email & Skyslope", defaultType: "DOCS" },
    { key: "sale-sold-announce", title: "Announce in #alwaysbeclosing & #deals", defaultType: "OTHER" },
    { key: "sale-sold-update-sheets", title: "Update sales tracking & agent sheets", defaultType: "OTHER" }
  ],
  LEASE_LISTING_LEASED: [
    { key: "lease-leased-send-package", title: "Send lease package to landlord", defaultType: "DOCS" },
    { key: "lease-leased-turn-off-showings", title: "Turn off showings on BrokerBay", defaultType: "OTHER" },
    { key: "lease-leased-upload-skyslope", title: "Upload signed lease to Skyslope", defaultType: "DOCS" },
    { key: "lease-leased-update-tracking", title: "Update lease tracking sheets", defaultType: "OTHER" },
    { key: "lease-leased-arrange-removal", title: "Arrange sign & lockbox removal", defaultType: "OTHER" },
    { key: "lease-leased-update-trreb", title: "Update listing status on TRREB to \u2018Leased\u2019", defaultType: "OTHER" }
  ],
  LEASE_LISTING_CLOSING: [
    { key: "lease-closing-move-folder", title: "Move listing folder to Closed Leases", defaultType: "OTHER" },
    { key: "lease-closing-key-exchange", title: "Confirm key exchange details", defaultType: "OTHER" },
    { key: "lease-closing-reminders", title: "Send reminder emails one week before key exchange", defaultType: "OTHER" },
    { key: "lease-closing-insurance-proof", title: "Ensure tenant insurance proof received", defaultType: "REVIEW" }
  ],
  BUYER_DEAL_CLOSING: [
    { key: "buyer-closing-update-sheets", title: "Update sales tracking sheets", defaultType: "OTHER" },
    { key: "buyer-closing-collect-waiver", title: "Collect signed waiver / Notice of Fulfillment", defaultType: "DOCS" },
    { key: "buyer-closing-prepare-skyslope", title: "Prepare Skyslope paperwork", defaultType: "DOCS" },
    { key: "buyer-closing-schedule-dates", title: "Schedule closing-related dates and reminders", defaultType: "OTHER" },
    { key: "buyer-closing-congrats", title: "Send congratulations email to buyer", defaultType: "OTHER" }
  ],
  LEASE_TENANT_DEAL_CLOSING: [
    { key: "tenant-closing-congrats", title: "Send congratulations email to tenant", defaultType: "OTHER" },
    { key: "tenant-closing-archive-slack", title: "Archive Slack threads related to deal", defaultType: "OTHER" },
    { key: "tenant-closing-create-tenant-folder", title: "Create tenant folder in Closed Leases", defaultType: "OTHER" },
    { key: "tenant-closing-insurance-proof", title: "Ensure tenant insurance proof received", defaultType: "REVIEW" },
    { key: "tenant-closing-key-exchange", title: "Send key exchange instructions", defaultType: "OTHER" }
  ],
  RELIST_LISTING_DEAL: [
    { key: "relist-draft", title: "Draft (TRREB + Cornerstone)", defaultType: "COPYWRITING" },
    { key: "relist-send-drafts", title: "Send MLS drafts to agent to approve", defaultType: "COPYWRITING" },
    { key: "relist-marketing-update", title: "Tell Marketing to update website if price changed", defaultType: "OTHER" },
    { key: "relist-paperwork", title: "Send listing paperwork for signatures", defaultType: "DOCS" },
    { key: "relist-cancel-previous", title: "Cancel previous listing (cancel and relist)", defaultType: "OTHER" },
    { key: "relist-folder", title: "Add signed paperwork to \u2018Re-list: Date\u2019 folder", defaultType: "DOCS" },
    { key: "relist-post-live", title: "Post listing live on TRREB + Cornerstone", defaultType: "PUBLISH" },
    { key: "relist-brokerbay", title: "Configure BrokerBay showing instructions", defaultType: "OTHER" },
    { key: "relist-announce", title: "Send Slack message to #just-listed", defaultType: "OTHER" },
    { key: "relist-eare-tv", title: "Update EARE TV spreadsheet (price/expiry)", defaultType: "OTHER" },
    { key: "relist-sign-expiry", title: "Change expiry date on signs & lockbox spreadsheet", defaultType: "OTHER" },
    { key: "relist-skyslope", title: "Skyslope listing paperwork", defaultType: "DOCS" }
  ]
};
var autoId = 1e3;
var makeId = () => `tsk-tmpl-${autoId++}`;
function instantiateCategoryForListing(params) {
  const { listing, type, agentId } = params;
  const templates = categoryTemplates[type] || [];
  const startDate = /* @__PURE__ */ new Date();
  const tasks2 = templates.map((tmpl, idx) => {
    const due = new Date(startDate.getTime() + (idx + 1) * 24 * 60 * 60 * 1e3);
    const status = idx === 0 ? "IN_PROGRESS" : idx < 2 ? "NEW" : "NEW";
    const claimedById = idx === 0 ? agentId : void 0;
    const tmplMeta = templates[idx];
    return {
      id: makeId(),
      title: tmpl.title,
      listingId: listing.id,
      status,
      dueDate: due.toISOString(),
      claimedById,
      urgencyScore: Math.max(20, 100 - idx * 10),
      type: tmpl.defaultType,
      templateKey: tmplMeta?.key,
      inputs: {},
      outputs: Object.fromEntries((tmplMeta?.outputs || []).map((o) => [o.key, ""]))
    };
  });
  const workItem = {
    id: `wi-${listing.id}-${type.toLowerCase()}`,
    type,
    title: `${listing.address} \u2014 ${type.replaceAll("_", " ").toLowerCase()}`,
    listingId: listing.id,
    taskIds: tasks2.map((t) => t.id)
  };
  return { tasks: tasks2, workItem };
}

// src/components/operations-center/mocks.ts
var now = /* @__PURE__ */ new Date();
var iso = (d) => d.toISOString();
var daysFromNow = (n) => iso(new Date(now.getTime() + n * 24 * 60 * 60 * 1e3));
var agents = [
  { id: "agent-noah", name: "Noah Deskin", email: "deskinnoah@gmail.com" },
  { id: "agent-amy", name: "Amy Chen", email: "amy@example.com" },
  { id: "agent-lee", name: "Lee Park", email: "lee@example.com" }
];
var playbooks = [
  { id: "pb-standard", name: "Standard Listing" },
  { id: "pb-luxury", name: "Luxury Listing" }
];
var listings = [
  { id: "lst-101", address: "12 Maple St", status: "IN_PROGRESS", agentId: "agent-amy", dueDate: daysFromNow(3) },
  { id: "lst-102", address: "45 Oak Ave", status: "IN_PROGRESS", agentId: "agent-lee", dueDate: daysFromNow(1) },
  { id: "lst-201", address: "23 Birch Dr", status: "IN_PROGRESS", agentId: "agent-amy", dueDate: daysFromNow(4) },
  // SALE_LISTING_CLOSING
  { id: "lst-202", address: "77 Cedar Ln", status: "DONE_POSTED", agentId: "agent-lee", dueDate: daysFromNow(-10) },
  // SALE_LISTING_SOLD (archived)
  { id: "lst-203", address: "5 Spruce Ct", status: "IN_PROGRESS", agentId: "agent-amy", dueDate: daysFromNow(2) },
  // LEASE_LISTING_LEASED
  { id: "lst-204", address: "88 Walnut Ave", status: "IN_PROGRESS", agentId: "agent-lee", dueDate: daysFromNow(5) },
  // LEASE_LISTING_CLOSING
  { id: "lst-205", address: "19 Willow Way", status: "IN_PROGRESS", agentId: "agent-amy", dueDate: daysFromNow(6) },
  // BUYER_DEAL_CLOSING
  { id: "lst-206", address: "901 King St", status: "IN_PROGRESS", agentId: "agent-lee", dueDate: daysFromNow(3) },
  // LEASE_TENANT_DEAL_CLOSING
  { id: "lst-207", address: "330 Queen St", status: "IN_PROGRESS", agentId: "agent-amy", dueDate: daysFromNow(7) }
  // RELIST_LISTING_DEAL
];
var baseTasks = [
  {
    id: "tsk-1",
    title: "Draft MLS Description",
    listingId: "lst-101",
    playbookId: "pb-standard",
    status: "NEW",
    dueDate: daysFromNow(1),
    urgencyScore: 85,
    type: "COPYWRITING",
    template: "MLS Description: ..."
  },
  {
    id: "tsk-2",
    title: "Select Hero Photos",
    listingId: "lst-101",
    playbookId: "pb-standard",
    status: "IN_PROGRESS",
    dueDate: daysFromNow(2),
    urgencyScore: 70,
    type: "PHOTO_EDIT",
    claimedById: "agent-noah"
  },
  {
    id: "tsk-3",
    title: "Compliance Review",
    listingId: "lst-102",
    playbookId: "pb-luxury",
    status: "NEW",
    dueDate: daysFromNow(0),
    urgencyScore: 95,
    type: "REVIEW"
  },
  {
    id: "tsk-4",
    title: "Publish to MLS",
    listingId: "lst-103",
    status: "NEW",
    dueDate: daysFromNow(1),
    urgencyScore: 50,
    type: "PUBLISH"
  },
  // Example stray task (no listingId)
  {
    id: "tsk-5",
    title: "Update agent bio for website",
    status: "NEW",
    dueDate: daysFromNow(2),
    urgencyScore: 40,
    type: "OTHER",
    queue: "MARKETING",
    agentId: "agent-noah",
    address: "\u2014"
  },
  {
    id: "tsk-6",
    title: "Upload signed listing agreement",
    status: "NEW",
    dueDate: daysFromNow(1),
    urgencyScore: 75,
    type: "DOCS",
    queue: "ADMIN",
    agentId: "agent-amy",
    address: "12 Maple St"
  }
];
var notes = [
  { id: "note-1", listingId: "lst-101", authorId: "agent-noah", createdAt: iso(now), body: "Need agent confirmation on bedroom count." }
];
var attachments = [
  { id: "att-1", listingId: "lst-101", name: "Floorplan.pdf", url: "#" }
];
var history = [
  { id: "evt-1", listingId: "lst-101", type: "CREATED", timestamp: iso(now), summary: "Listing created" },
  { id: "evt-2", listingId: "lst-101", type: "STATUS_CHANGED", timestamp: iso(now), summary: "Status set to NEW" }
];
var inst101 = instantiateCategoryForListing({ listing: listings[0], type: "LEASE_LISTING_ACTIVE", agentId: "agent-amy" });
var inst102 = instantiateCategoryForListing({ listing: listings[1], type: "SALES_LISTING_ACTIVE", agentId: "agent-lee" });
var inst201 = instantiateCategoryForListing({ listing: listings[2], type: "SALE_LISTING_CLOSING", agentId: "agent-amy" });
var inst202 = instantiateCategoryForListing({ listing: listings[3], type: "SALE_LISTING_SOLD", agentId: "agent-lee" });
var inst203 = instantiateCategoryForListing({ listing: listings[4], type: "LEASE_LISTING_LEASED", agentId: "agent-amy" });
var inst204 = instantiateCategoryForListing({ listing: listings[5], type: "LEASE_LISTING_CLOSING", agentId: "agent-lee" });
var inst205 = instantiateCategoryForListing({ listing: listings[6], type: "BUYER_DEAL_CLOSING", agentId: "agent-amy" });
var inst206 = instantiateCategoryForListing({ listing: listings[7], type: "LEASE_TENANT_DEAL_CLOSING", agentId: "agent-lee" });
var inst207 = instantiateCategoryForListing({ listing: listings[8], type: "RELIST_LISTING_DEAL", agentId: "agent-amy" });
var tasks = [
  ...inst101.tasks,
  ...inst102.tasks,
  ...inst201.tasks,
  ...inst202.tasks,
  ...inst203.tasks,
  ...inst204.tasks,
  ...inst205.tasks,
  ...inst206.tasks,
  ...inst207.tasks,
  // one stray per queue for demo
  {
    id: "tsk-stray-1",
    title: "Upload signed listing agreement",
    status: "NEW",
    dueDate: daysFromNow(1),
    urgencyScore: 75,
    type: "DOCS",
    queue: "ADMIN",
    agentId: "agent-amy",
    address: listings[0].address
  },
  {
    id: "tsk-stray-2",
    title: "Update agent bio for website",
    status: "NEW",
    dueDate: daysFromNow(2),
    urgencyScore: 40,
    type: "OTHER",
    queue: "MARKETING",
    agentId: "agent-noah",
    address: "\u2014"
  }
];
var workItems = [
  inst101.workItem,
  inst102.workItem,
  inst201.workItem,
  inst202.workItem,
  inst203.workItem,
  inst204.workItem,
  inst205.workItem,
  inst206.workItem,
  inst207.workItem
];
var initialOperationsData = {
  agents,
  playbooks,
  listings,
  tasks,
  notes,
  attachments,
  history,
  workItems
};
export {
  initialOperationsData
};
