/* eslint-disable react-refresh/only-export-components */
import React from "react";
// Local minimal type declarations to keep this file self-contained
type InputType  = "text" | "number" | "select" | "date" | "toggle" | "file";
type OutputType = "table" | "chart" | "markdown" | "json" | "badge";

type BaseComponentDef = {
  id: string;
  kind: "input" | "output";
  type: InputType | OutputType;
  label?: string;
  description?: string;
  binding?: string;
  config?: Record<string, unknown>;
};

export type InputDef  = BaseComponentDef & { kind: "input";  type: InputType;  required?: boolean; defaultValue?: unknown };
export type OutputDef = BaseComponentDef & { kind: "output"; type: OutputType; defaultValue?: unknown };

export type InputRendererProps = {
  def: InputDef;
  id: string;
  value: unknown;
  setValue: (value: unknown) => void;
  disabled?: boolean;
};

export type OutputRendererProps = {
  def: OutputDef;
  data: unknown;
};

export type ComponentRegistry = {
  inputs: Partial<Record<InputType, React.FC<InputRendererProps>>>;
  outputs: Partial<Record<OutputType, React.FC<OutputRendererProps>>>;
};
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

const TextInput: React.FC<InputRendererProps> = ({ def, id, value, setValue, disabled }) => {
  const cfg = def.config as { placeholder?: string; multiline?: boolean } | undefined;
  const stringValue = String(value ?? "");
  return (
    <div className="tsui-item">
      {def.label && <Label htmlFor={id}>{def.label}</Label>}
      { cfg?.multiline ? (
        <textarea id={id} className="tsui-select" value={stringValue} onChange={(e) => setValue(e.target.value)} placeholder={String(cfg?.placeholder ?? "")} disabled={disabled} />
      ) : (
        <Input id={id} value={stringValue} onChange={(e) => setValue(e.target.value)} placeholder={String(cfg?.placeholder ?? "")} disabled={disabled} />
      ) }
      {def.description && <p className="tsui-desc">{def.description}</p>}
    </div>
  );
};

const NumberInput: React.FC<InputRendererProps> = ({ def, id, value, setValue, disabled }) => {
  const numValue = typeof value === "number" || value === undefined || value === null ? (value as number | undefined) : Number(String(value));
  return (
    <div className="tsui-item">
      {def.label && <Label htmlFor={id}>{def.label}</Label>}
      <Input id={id} type="number" value={Number.isFinite(numValue as number) ? (numValue as number) : ""} onChange={(e) => setValue(e.target.value === "" ? undefined : Number(e.target.value))} disabled={disabled} />
      {def.description && <p className="tsui-desc">{def.description}</p>}
    </div>
  );
};

const DateInput: React.FC<InputRendererProps> = ({ def, id, value, setValue, disabled }) => {
  const toStr = (v: unknown) => {
    if (!v) return "";
    if (Array.isArray(v)) return ""; // guard against array defaults
    const d = v instanceof Date ? v : new Date(String(v));
    return isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  };
  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (!next) return setValue(undefined);
    const d = new Date(next);
    setValue(isNaN(d.getTime()) ? undefined : d.toISOString());
  };
  return (
    <div className="tsui-item">
      {def.label && <Label htmlFor={id}>{def.label}</Label>}
      <Input id={id} type="date" value={toStr(value)} onChange={onChange} disabled={disabled} />
      {def.description && <p className="tsui-desc">{def.description}</p>}
    </div>
  );
};

const ToggleInput: React.FC<InputRendererProps> = ({ def, id, value, setValue, disabled }) => {
  const checked = Boolean(value);
  return (
    <div className="tsui-item tsui-switch">
      <Switch id={id} checked={checked} onCheckedChange={(v) => setValue(Boolean(v))} disabled={disabled} />
      {def.label && (
        <Label htmlFor={id} className="tsui-inline-label">{def.label}</Label>
      )}
      {def.description && <p className="tsui-desc">{def.description}</p>}
    </div>
  );
};

const SelectInput: React.FC<InputRendererProps> = ({ def, id, value, setValue, disabled }) => {
  const cfg = def.config as { options?: Array<string | { value: string; label: string }> } | undefined;
  const options = cfg?.options ?? [];
  const normalized = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className="tsui-item">
      {def.label && <Label htmlFor={id}>{def.label}</Label>}
      <select id={id} className="tsui-select" value={String(value ?? "")} onChange={(e) => setValue(e.target.value || undefined)} disabled={disabled}>
        <option value="">Select…</option>
        {normalized.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {def.description && <p className="tsui-desc">{def.description}</p>}
    </div>
  );
};

const TableOutput: React.FC<OutputRendererProps> = ({ def, data }) => {
  const rowsFromObj = (val: unknown): Array<Record<string, unknown>> => {
    if (Array.isArray(val)) return val as Array<Record<string, unknown>>;
    if (val && typeof val === "object" && Array.isArray((val as { rows?: unknown }).rows)) {
      return (val as { rows: Array<Record<string, unknown>> }).rows;
    }
    return [];
  };
  const rows = rowsFromObj(data);
  const cols = rows.length ? Object.keys(rows[0] as Record<string, unknown>) : [];
  return (
    <div className="tsui-item">
      {def.label && <div className="tsui-output-label">{def.label}</div>}
      <div className="tsui-table-wrap">
        <table className="tsui-table">
          <thead>
            <tr>{cols.map((c) => (<th key={c}>{c}</th>))}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>{cols.map((c) => (<td key={c}>{String((r as Record<string, unknown>)[c])}</td>))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const BadgeOutput: React.FC<OutputRendererProps> = ({ def, data }) => {
  const value = typeof data === "number" || typeof data === "string"
    ? data
    : (data && typeof data === "object" && "value" in (data as Record<string, unknown>)
        ? (data as Record<string, unknown>)["value"] as unknown
        : "");
  return (
    <div className="tsui-item">
      {def.label && <div className="tsui-output-label">{def.label}</div>}
      <Badge variant="secondary">{String(value)}</Badge>
    </div>
  );
};

const JsonOutput: React.FC<OutputRendererProps> = ({ def, data }) => {
  return (
    <div className="tsui-item">
      {def.label && <div className="tsui-output-label">{def.label}</div>}
      <pre className="tsui-pre">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
};

const MarkdownOutput: React.FC<OutputRendererProps> = ({ def, data }) => {
  const text = typeof data === "string"
    ? data
    : (data && typeof data === "object" && "text" in (data as Record<string, unknown>)
        ? String((data as Record<string, unknown>)["text"] ?? "")
        : "");
  return (
    <div className="tsui-item">
      {def.label && <div className="tsui-output-label">{def.label}</div>}
      <div className="tsui-markdown" aria-label={def.label || "Markdown"}>
        {text}
      </div>
    </div>
  );
};

// Simple placeholder chart: requires data: { x: string|number, y: number }[]
const ChartOutput: React.FC<OutputRendererProps> = ({ def, data }) => {
  const rowsUnknown: unknown[] = Array.isArray(data)
    ? (data as unknown[])
    : (Array.isArray((data as Record<string, unknown> | null | undefined)?.rows)
        ? ((data as Record<string, unknown>).rows as unknown[])
        : []);
  const filtered: Array<{ x: unknown; y: number }> = rowsUnknown
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .map((r) => {
      const yNum = Number((r as Record<string, unknown>).y);
      return { x: (r as Record<string, unknown>).x, y: Number.isFinite(yNum) ? Math.max(0, Math.min(100, yNum)) : NaN };
    })
    .filter((r) => Number.isFinite(r.y));
  return (
    <div className="tsui-item">
      {def.label && <div className="tsui-output-label">{def.label}</div>}
      <div className="tsui-chart">
        {filtered.length ? (
          <svg width="100%" height="120" role="img" aria-label={def.label || "Chart"}>
            <rect x="0" y="0" width="100%" height="100%" fill="var(--ts-surface)" stroke="var(--ts-border-color)" />
            {filtered.map((r, i) => (
              <circle key={i} cx={`${(i / Math.max(1, filtered.length - 1)) * 100}%`} cy={`${100 - r.y}%`} r="3" fill="var(--ts-accent)" />
            ))}
          </svg>
        ) : (
          <div className="tsui-empty">No data</div>
        )}
      </div>
    </div>
  );
};

export function buildDefaultComponentRegistry(): ComponentRegistry {
  return {
    inputs: {
      text: TextInput,
      number: NumberInput,
      select: SelectInput,
      date: DateInput,
      toggle: ToggleInput,
      file: FileInput,
    },
    outputs: {
      table: TableOutput,
      chart: ChartOutput,
      markdown: MarkdownOutput,
      json: JsonOutput,
      badge: BadgeOutput,
    },
  };
}

