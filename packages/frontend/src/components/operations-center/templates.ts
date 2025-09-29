import type { Task, UUID, WorkItem, WorkItemType, Listing } from "./types";
import categoryTemplatesJson from "../../../shared/category-templates.json";

export interface TaskTemplate {
  key: string; // stable identifier for FE/BE contracts
  title: string;
  defaultType: Task["type"]; // COPYWRITING | PHOTO_EDIT | DOCS | REVIEW | PUBLISH | OTHER
  resources?: readonly string[]; // From CSV (what backend provides)
  outputs?: readonly { key: string; label: string; kind: "checkbox" | "text" | "upload" }[]; // From CSV (what user provides)
}

export type CategoryTemplates = Record<WorkItemType, readonly TaskTemplate[]>;

type CategoryTemplatesAssert = (value: unknown) => asserts value is CategoryTemplates;

const assertCategoryTemplates: CategoryTemplatesAssert = (value) => {
  if (!value || typeof value !== "object") {
    throw new Error("category-templates.json must export an object of template arrays");
  }
  const entries = Object.values(value as Record<string, unknown>);
  for (const templates of entries) {
    if (!Array.isArray(templates)) {
      throw new Error("Each category should be an array of task templates");
    }
    for (const tmpl of templates) {
      const candidate = tmpl as Partial<TaskTemplate>;
      if (
        !candidate ||
        typeof candidate.key !== "string" ||
        typeof candidate.title !== "string" ||
        typeof candidate.defaultType !== "string"
      ) {
        throw new Error(`Invalid task template entry detected: ${JSON.stringify(tmpl)}`);
      }
    }
  }
};

// Ordered task templates per category (curated from the CSV spec)
const rawCategoryTemplates: unknown = categoryTemplatesJson;
assertCategoryTemplates(rawCategoryTemplates);
export const categoryTemplates = rawCategoryTemplates as CategoryTemplates;

let autoId = 1000;
const makeId = () => `tsk-tmpl-${autoId++}`;

export function instantiateCategoryForListing(params: {
  listing: Listing;
  type: WorkItemType;
  agentId: UUID;
}): { tasks: Task[]; workItem: WorkItem } {
  const { listing, type, agentId } = params;
  const templates = categoryTemplates[type] || [];
  const startDate = new Date();
  const tasks: Task[] = templates.map((tmpl, idx) => {
    const due = new Date(startDate.getTime() + (idx + 1) * 24 * 60 * 60 * 1000);
    const status = idx === 0 ? "IN_PROGRESS" : idx < 2 ? "NEW" : "NEW";
    const claimedById = idx === 0 ? agentId : undefined;
    const tmplMeta = templates[idx];
    const baseOutputs: Record<string, string> = Object.fromEntries((tmplMeta?.outputs || []).map(o => [o.key, ""]));
    if (tmplMeta?.resources?.length) {
      const list = tmplMeta.resources.map(item => `<li>${item}</li>`).join("");
      baseOutputs[`resources_${tmplMeta.key}`] = `<ul>${list}</ul>`;
    }
    baseOutputs[`notes_${tmplMeta.key}`] = "";

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
      outputs: baseOutputs,
    } as Task;
  });

  const workItem: WorkItem = {
    id: `wi-${listing.id}-${type.toLowerCase()}`,
    type,
    title: `${listing.address} — ${`${type}`.replace(/_/g, " ").toLowerCase()}`,
    listingId: listing.id,
    taskIds: tasks.map(t => t.id),
  };

  return { tasks, workItem };
}
