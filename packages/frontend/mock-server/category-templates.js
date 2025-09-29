const categoryTemplates = require("../shared/category-templates.json");

let autoId = 1000;
const makeId = () => `tsk-tmpl-${autoId++}`;

function instantiateCategoryForListing({ listing, type, agentId }) {
  const templates = categoryTemplates[type] || [];
  const startDate = new Date();
  const tasks = templates.map((tmpl, idx) => {
    const due = new Date(startDate.getTime() + (idx + 1) * 24 * 60 * 60 * 1000);
    const status = idx === 0 ? "IN_PROGRESS" : idx < 2 ? "NEW" : "NEW";
    const claimedById = idx === 0 ? agentId : undefined;
    const outputs = (tmpl.outputs || []).reduce((acc, output) => {
      acc[output.key] = "";
      return acc;
    }, {});
    if (tmpl.resources && tmpl.resources.length) {
      outputs[`resources_${tmpl.key}`] = `<ul>${tmpl.resources.map(item => `<li>${item}</li>`).join("")}</ul>`;
    }
    outputs[`notes_${tmpl.key}`] = "";

    return {
      id: makeId(),
      title: tmpl.title,
      listingId: listing.id,
      status,
      dueDate: due.toISOString(),
      claimedById,
      urgencyScore: Math.max(20, 100 - idx * 10),
      type: tmpl.defaultType,
      templateKey: tmpl.key,
      inputs: {},
      outputs,
    };
  });

  const workItem = {
    id: `wi-${listing.id}-${String(type).toLowerCase()}`,
    type,
    title: `${listing.address} — ${String(type).replaceAll("_", " ").toLowerCase()}`,
    listingId: listing.id,
    taskIds: tasks.map(task => task.id),
  };

  return { tasks, workItem };
}

function resetTemplateIds() {
  autoId = 1000;
}

module.exports = {
  categoryTemplates,
  instantiateCategoryForListing,
  resetTemplateIds,
};
