#!/usr/bin/env node
import fs from "fs";
import path from "path";
import url from "url";

// Resolve project root from this script location
const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

async function loadOperationsData() {
  const operationsPath = path.join(projectRoot, "mock-server", "operations-data.js");
  const mod = await import(url.pathToFileURL(operationsPath).href);
  const factory = mod.createInitialOperationsState || mod.default?.createInitialOperationsState;
  if (!factory) {
    throw new Error("createInitialOperationsState export not found in operations-data.js");
  }
  const data = factory();
  if (!data || !Array.isArray(data.tasks)) {
    throw new Error("Unable to load tasks from operations data");
  }
  return data;
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 80);
}

function renderTaskMd(task, context) {
  const { listings, agents } = context;
  const listing = task.listingId ? listings.find(l => l.id === task.listingId) : undefined;
  const agent = task.claimedById ? agents.find(a => a.id === task.claimedById) : undefined;
  const lines = [];
  lines.push(`# ${task.title}`);
  lines.push("");
  lines.push(`- **Task ID**: ${task.id}`);
  lines.push(`- **Status**: ${task.status}`);
  lines.push(`- **Type**: ${task.type}`);
  lines.push(`- **Due**: ${task.dueDate}`);
  lines.push(`- **Urgency**: ${task.urgencyScore}`);
  if (task.templateKey) lines.push(`- **Template**: ${task.templateKey}`);
  if (listing) lines.push(`- **Listing**: ${listing.address} (${listing.id})`);
  if (task.queue) lines.push(`- **Queue**: ${task.queue}`);
  if (task.agentId) lines.push(`- **Agent (for stray)**: ${task.agentId}`);
  if (agent) lines.push(`- **Claimed By**: ${agent.name} (${agent.id})`);
  lines.push("");
  if (task.inputs && Object.keys(task.inputs).length) {
    lines.push("## Inputs");
    Object.entries(task.inputs).forEach(([k, v]) => {
      lines.push(`- ${k}: ${v}`);
    });
    lines.push("");
  }
  if (task.outputs && Object.keys(task.outputs).length) {
    lines.push("## Outputs");
    Object.entries(task.outputs).forEach(([k, v]) => {
      lines.push(`- ${k}: ${v}`);
    });
    lines.push("");
  }
  if (task.template) {
    lines.push("## Template");
    lines.push("");
    lines.push("```\n" + task.template + "\n```");
    lines.push("");
  }
  return lines.join("\n");
}

async function main() {
  const data = await loadOperationsData();
  const outDir = path.join(projectRoot, "docs", "tasks");
  fs.mkdirSync(outDir, { recursive: true });
  let count = 0;
  for (const task of data.tasks) {
    const base = `${task.id}-${slugify(task.title) || "task"}.md`;
    const filePath = path.join(outDir, base);
    const md = renderTaskMd(task, { listings: data.listings, agents: data.agents });
    fs.writeFileSync(filePath, md, "utf8");
    count += 1;
  }
  console.log(`Wrote ${count} task files to ${outDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
