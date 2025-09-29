import { defineTask, type DefinedTask, type Department } from "./core";
import { categoryTemplates } from "@/components/operations-center/templates";
import type { WorkItemType } from "@/components/operations-center/types";

const marketingBuckets: WorkItemType[] = [
  "SALES_LISTING_ACTIVE",
  "LEASE_LISTING_ACTIVE",
  "RELIST_LISTING_DEAL",
];

const departmentFor = (type: WorkItemType): Department =>
  marketingBuckets.includes(type) ? "marketing" : "admin";

const createTaskDefinition = (
  type: WorkItemType,
  order: number,
  title: string,
  key: string,
  resources: readonly string[] | undefined,
  outputs: readonly { key: string; label: string; kind: "checkbox" | "text" | "upload" }[] | undefined
): DefinedTask => {
  const resourceComponents = resources && resources.length
    ? [
        {
          id: `${key}-resources`,
          kind: "output" as const,
          type: "markdown" as const,
          label: "Resources",
          binding: `resources_${key}`,
          config: { multiline: true },
        },
      ]
    : [];

  const outputComponents = (outputs ?? []).map((output, idx) => {
    if (output.kind === "checkbox") {
      return {
        id: `${key}-out-${idx}`,
        kind: "input" as const,
        type: "toggle" as const,
        label: output.label,
        binding: output.key,
        defaultValue: false,
      };
    }
    if (output.kind === "upload") {
      return {
        id: `${key}-out-${idx}`,
        kind: "input" as const,
        type: "file" as const,
        label: output.label,
        binding: output.key,
      };
    }
    return {
      id: `${key}-out-${idx}`,
      kind: "input" as const,
      type: "text" as const,
      label: output.label,
      binding: output.key,
    };
  });

  const components = [
    ...resourceComponents,
    ...outputComponents,
    {
      id: `${key}-notes`,
      kind: "input" as const,
      type: "text" as const,
      label: "Notes",
      binding: `notes_${key}`,
      config: { multiline: true },
    },
  ] as const;

  return defineTask({
    version: 1,
    id: key,
    name: title,
    taskGroupId: type,
    order,
    department: departmentFor(type),
    screen: {
      id: `${key}-screen`,
      title,
      layout: { kind: "stack" },
      components,
    },
  });
};

const definitions = new Map<string, DefinedTask>();

(Object.keys(categoryTemplates) as WorkItemType[]).forEach((type) => {
  const templates = categoryTemplates[type] ?? [];
  templates.forEach((tmpl, index) => {
    const def = createTaskDefinition(type, index, tmpl.title, tmpl.key, tmpl.resources, tmpl.outputs);
    definitions.set(tmpl.key, def);
  });
});

export const taskDefinitions = definitions;

export function getTaskDefinition(templateKey: string | undefined) {
  if (!templateKey) return undefined;
  return taskDefinitions.get(templateKey);
}
