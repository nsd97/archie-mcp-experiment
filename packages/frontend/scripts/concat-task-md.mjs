#!/usr/bin/env node
import fs from "fs";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const tasksDir = path.join(projectRoot, "docs", "tasks");
const outFile = path.join(projectRoot, "docs", "tasks.md");

if (!fs.existsSync(tasksDir)) {
  console.error(`Tasks directory not found: ${tasksDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(tasksDir)
  .filter(f => f.endsWith(".md"))
  // Sort by task id then name to make stable
  .sort((a, b) => a.localeCompare(b));

let content = "";
for (const f of files) {
  const filePath = path.join(tasksDir, f);
  const md = fs.readFileSync(filePath, "utf8").trim();
  if (!md) continue;
  if (content) content += "\n\n---\n\n"; // separator between tasks
  content += md;
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, content + "\n", "utf8");
console.log(`Wrote ${files.length} tasks into ${outFile}`);


