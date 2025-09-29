const { instantiateCategoryForListing, resetTemplateIds } = require('./category-templates');

const dayMs = 24 * 60 * 60 * 1000;

function createInitialOperationsState() {
  resetTemplateIds();
  const now = new Date();
  const iso = (date) => date.toISOString();
  const daysFromNow = (n) => iso(new Date(now.getTime() + n * dayMs));

  const agents = [
    { id: 'agent-noah', name: 'Noah Deskin', email: 'deskinnoah@gmail.com' },
    { id: 'agent-amy', name: 'Amy Chen', email: 'amy@example.com' },
    { id: 'agent-lee', name: 'Lee Park', email: 'lee@example.com' },
  ];

  const playbooks = [
    { id: 'pb-standard', name: 'Standard Listing' },
    { id: 'pb-luxury', name: 'Luxury Listing' },
  ];

  const listings = [
    { id: 'lst-101', address: '12 Maple St', status: 'IN_PROGRESS', agentId: 'agent-amy', dueDate: daysFromNow(3), dealType: 'Lease', propertyType: 'Detached', squareFootage: 1800, location: 'Toronto, ON' },
    { id: 'lst-102', address: '45 Oak Ave', status: 'IN_PROGRESS', agentId: 'agent-lee', dueDate: daysFromNow(1), dealType: 'Sale', propertyType: 'Townhouse', squareFootage: 1500 },
    { id: 'lst-201', address: '23 Birch Dr', status: 'IN_PROGRESS', agentId: 'agent-amy', dueDate: daysFromNow(4), dealType: 'Sale', propertyType: 'Detached', squareFootage: 2200 },
    { id: 'lst-202', address: '77 Cedar Ln', status: 'DONE_POSTED', agentId: 'agent-lee', dueDate: daysFromNow(-10), dealType: 'Sale', propertyType: 'Condo', squareFootage: 900 },
    { id: 'lst-203', address: '5 Spruce Ct', status: 'IN_PROGRESS', agentId: 'agent-amy', dueDate: daysFromNow(2), dealType: 'Lease', propertyType: 'Condo', squareFootage: 700 },
    { id: 'lst-204', address: '88 Walnut Ave', status: 'IN_PROGRESS', agentId: 'agent-lee', dueDate: daysFromNow(5), dealType: 'Lease', propertyType: 'Semi-Detached', squareFootage: 1600 },
    { id: 'lst-205', address: '19 Willow Way', status: 'IN_PROGRESS', agentId: 'agent-amy', dueDate: daysFromNow(6), dealType: 'Buyer Deal', propertyType: 'Detached', squareFootage: 2000 },
    { id: 'lst-206', address: '901 King St', status: 'IN_PROGRESS', agentId: 'agent-lee', dueDate: daysFromNow(3), dealType: 'Tenant Deal', propertyType: 'Condo', squareFootage: 650 },
    { id: 'lst-207', address: '330 Queen St', status: 'IN_PROGRESS', agentId: 'agent-amy', dueDate: daysFromNow(7), dealType: 'Relist', propertyType: 'Detached', squareFootage: 2100 },
  ];

  const inst101 = instantiateCategoryForListing({ listing: listings[0], type: 'LEASE_LISTING_ACTIVE', agentId: 'agent-amy' });
  const inst102 = instantiateCategoryForListing({ listing: listings[1], type: 'SALES_LISTING_ACTIVE', agentId: 'agent-lee' });
  const inst201 = instantiateCategoryForListing({ listing: listings[2], type: 'SALE_LISTING_CLOSING', agentId: 'agent-amy' });
  const inst202 = instantiateCategoryForListing({ listing: listings[3], type: 'SALE_LISTING_SOLD', agentId: 'agent-lee' });
  const inst203 = instantiateCategoryForListing({ listing: listings[4], type: 'LEASE_LISTING_LEASED', agentId: 'agent-amy' });
  const inst204 = instantiateCategoryForListing({ listing: listings[5], type: 'LEASE_LISTING_CLOSING', agentId: 'agent-lee' });
  const inst205 = instantiateCategoryForListing({ listing: listings[6], type: 'BUYER_DEAL_CLOSING', agentId: 'agent-amy' });
  const inst206 = instantiateCategoryForListing({ listing: listings[7], type: 'LEASE_TENANT_DEAL_CLOSING', agentId: 'agent-lee' });
  const inst207 = instantiateCategoryForListing({ listing: listings[8], type: 'RELIST_LISTING_DEAL', agentId: 'agent-amy' });

  const tasks = [
    ...inst101.tasks,
    ...inst102.tasks,
    ...inst201.tasks,
    ...inst202.tasks,
    ...inst203.tasks,
    ...inst204.tasks,
    ...inst205.tasks,
    ...inst206.tasks,
    ...inst207.tasks,
    {
      id: 'tsk-stray-1',
      title: 'Upload signed listing agreement',
      status: 'NEW',
      dueDate: daysFromNow(1),
      urgencyScore: 75,
      type: 'DOCS',
      queue: 'ADMIN',
      agentId: 'agent-amy',
      address: listings[0].address,
    },
    {
      id: 'tsk-stray-2',
      title: 'Update agent bio for website',
      status: 'NEW',
      dueDate: daysFromNow(2),
      urgencyScore: 40,
      type: 'OTHER',
      queue: 'MARKETING',
      agentId: 'agent-noah',
      address: '—',
    },
  ];

  const notes = [
    { id: 'note-1', listingId: 'lst-101', authorId: 'agent-noah', createdAt: iso(now), body: 'Need agent confirmation on bedroom count.' },
  ];

  const attachments = [
    { id: 'att-1', listingId: 'lst-101', name: 'Floorplan.pdf', url: '#' },
  ];

  const history = [
    { id: 'evt-1', listingId: 'lst-101', type: 'CREATED', timestamp: iso(now), summary: 'Listing created' },
    { id: 'evt-2', listingId: 'lst-101', type: 'STATUS_CHANGED', timestamp: iso(now), summary: 'Status set to NEW' },
  ];

  const workItems = [
    inst101.workItem,
    inst102.workItem,
    inst201.workItem,
    inst202.workItem,
    inst203.workItem,
    inst204.workItem,
    inst205.workItem,
    inst206.workItem,
    inst207.workItem,
  ];

  return {
    agents,
    playbooks,
    listings,
    tasks,
    notes,
    attachments,
    history,
    workItems,
  };
}

module.exports = {
  createInitialOperationsState,
};
