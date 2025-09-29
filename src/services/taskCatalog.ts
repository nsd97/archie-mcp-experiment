import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

export type TaskDefinition = {
  task_def_id: string;
  version: number;
  title: string;
  description?: string;
  inputs_schema?: any;
  outputs_schema?: any;
  default_due_offset_hours?: number;
  visibility_group?: string;
  required_docs?: string[];
};

const ajv = new Ajv({ allErrors: true, strict: false });

const CATALOG_DIR = process.env.TASK_DEFINITIONS_DIR || path.join(process.cwd(), 'config', 'task-definitions');

const idToDef = new Map<string, TaskDefinition>();

export function loadTaskCatalog(): void {
  if (!fs.existsSync(CATALOG_DIR)) return;
  const files = fs.readdirSync(CATALOG_DIR).filter((f) => /\.(json)$/i.test(f));
  for (const file of files) {
    const full = path.join(CATALOG_DIR, file);
    const raw = fs.readFileSync(full, 'utf8');
    const def: TaskDefinition = JSON.parse(raw);
    if (!def?.task_def_id || typeof def.task_def_id !== 'string') {
      throw new Error(`Invalid task definition missing task_def_id: ${file}`);
    }
    if (typeof def.version !== 'number') {
      throw new Error(`Invalid task definition missing version number: ${file}`);
    }
    // Validate schemas if present
    if (def.inputs_schema) ajv.compile(def.inputs_schema);
    if (def.outputs_schema) ajv.compile(def.outputs_schema);
    idToDef.set(def.task_def_id, def);
  }
}

export function getTaskDefinition(taskDefId: string): TaskDefinition | undefined {
  return idToDef.get(taskDefId);
}

export function validateTaskInputs(taskDefId: string, payload: unknown): { valid: true } | { valid: false; errors: any } {
  const def = getTaskDefinition(taskDefId);
  if (!def) return { valid: false, errors: [{ message: `Unknown taskDefId: ${taskDefId}` }] };
  if (!def.inputs_schema) return { valid: true };
  const validate = ajv.compile(def.inputs_schema);
  const ok = validate(payload);
  return ok ? { valid: true } : { valid: false, errors: validate.errors };
}
export function validateTaskOutputs(
  taskDefId: string,
  payload: unknown
): { valid: true } | { valid: false; errors: any } {
  const def = getTaskDefinition(taskDefId);
  if (!def) return { valid: false, errors: [{ message: `Unknown taskDefId: ${taskDefId}` }] };
  if (!def.outputs_schema) return { valid: true };
  const validate = ajv.compile(def.outputs_schema);
  const ok = validate(payload);
  return ok ? { valid: true } : { valid: false, errors: validate.errors };
}


