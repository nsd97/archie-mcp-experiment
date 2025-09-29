import { Controller } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { registerComponent } from "./registry";
import type { InputDef, OutputDef } from "./core";
import "./styles.css";

const ensureArray = (val: unknown): string[] => (Array.isArray(val) ? (val as string[]) : []);

registerComponent("input", "text", ({ component, onChange, form }) => {
  const binding = (component as InputDef).binding;
  const multiline = Boolean(component.config?.multiline);
  if (!binding) return null;
  return (
    <Controller
      name={binding}
      control={form.control as any}
      render={({ field }) => (
        <div className="tsk-component" data-kind="input" data-type="text">
          {component.label && <Label htmlFor={binding}>{component.label}</Label>}
          {multiline ? (
            <Textarea
              id={binding}
              value={field.value ?? ""}
              onChange={(e) => {
                field.onChange(e.target.value);
                onChange?.(e.target.value);
              }}
            />
          ) : (
            <Input
              id={binding}
              value={field.value ?? ""}
              onChange={(e) => {
                field.onChange(e.target.value);
                onChange?.(e.target.value);
              }}
            />
          )}
        </div>
      )}
    />
  );
});

registerComponent("input", "number", ({ component, onChange, form }) => {
  const binding = (component as InputDef).binding;
  if (!binding) return null;
  return (
    <Controller
      name={binding}
      control={form.control as any}
      render={({ field }) => (
        <div className="tsk-component" data-kind="input" data-type="number">
          {component.label && <Label htmlFor={binding}>{component.label}</Label>}
          <Input
            id={binding}
            type="number"
            value={field.value ?? ""}
            onChange={(e) => {
              const next = e.target.value === "" ? undefined : Number(e.target.value);
              field.onChange(next);
              onChange?.(next);
            }}
          />
        </div>
      )}
    />
  );
});

registerComponent("input", "date", ({ component, onChange, form }) => {
  const binding = (component as InputDef).binding;
  if (!binding) return null;
  return (
    <Controller
      name={binding}
      control={form.control as any}
      render={({ field }) => (
        <div className="tsk-component" data-kind="input" data-type="date">
          {component.label && <Label htmlFor={binding}>{component.label}</Label>}
          <Input
            id={binding}
            type="date"
            value={field.value ?? ""}
            onChange={(e) => {
              field.onChange(e.target.value);
              onChange?.(e.target.value);
            }}
          />
        </div>
      )}
    />
  );
});

registerComponent("input", "toggle", ({ component, onChange, form }) => {
  const binding = (component as InputDef).binding;
  if (!binding) return null;
  return (
    <Controller
      name={binding}
      control={form.control as any}
      render={({ field }) => (
        <div className="tsk-component" data-kind="input" data-type="toggle">
          {component.label && <Label htmlFor={binding}>{component.label}</Label>}
          <Switch
            id={binding}
            checked={Boolean(field.value)}
            onCheckedChange={(checked) => {
              field.onChange(checked);
              onChange?.(checked);
            }}
          />
        </div>
      )}
    />
  );
});

registerComponent("input", "file", ({ component, onChange, form }) => {
  const binding = (component as InputDef).binding;
  if (!binding) return null;
  return (
    <Controller
      name={binding}
      control={form.control as any}
      render={({ field }) => (
        <div className="tsk-component" data-kind="input" data-type="file">
          {component.label && <Label htmlFor={binding}>{component.label}</Label>}
          <Input
            id={binding}
            type="file"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              field.onChange(file);
              onChange?.(file);
            }}
          />
        </div>
      )}
    />
  );
});

registerComponent("input", "select", ({ component, onChange, form }) => {
  const binding = (component as InputDef).binding;
  if (!binding) return null;
  const options = ensureArray(component.config?.options);
  return (
    <Controller
      name={binding}
      control={form.control as any}
      render={({ field }) => (
        <div className="tsk-component" data-kind="input" data-type="select">
          {component.label && <Label htmlFor={binding}>{component.label}</Label>}
          <Select
            value={field.value ?? ""}
            onValueChange={(value) => {
              field.onChange(value);
              onChange?.(value);
            }}
          >
            <SelectTrigger id={binding}>
              <SelectValue placeholder="Select" />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    />
  );
});

const MarkdownOutput = ({ value }: { value: any }) => {
  if (!value) return <div className="tsk-output tsk-output--empty">No content</div>;
  return <div className="tsk-output tsk-output--markdown" dangerouslySetInnerHTML={{ __html: String(value) }} />;
};

const JsonOutput = ({ value }: { value: any }) => (
  <pre className="tsk-output tsk-output--json">{JSON.stringify(value, null, 2)}</pre>
);

const BadgeOutput = ({ value, component }: { value: any; component: OutputDef }) => (
  <span className="tsk-output tsk-output--badge" data-intent={component.config?.intent || "default"}>
    {value ?? "—"}
  </span>
);

const TableOutput = ({ value }: { value: any }) => {
  const rows: any[] = Array.isArray(value) ? value : [];
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  if (rows.length === 0) return <div className="tsk-output tsk-output--empty">No rows</div>;
  return (
    <div className="tsk-output tsk-output--scroll">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {headers.map((header) => (
                <td key={header}>{String(row[header] ?? "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const ChartOutput = ({ value }: { value: any }) => (
  <Card className="tsk-output tsk-output--chart">
    <div>Chart renderer not implemented. Data: {JSON.stringify(value)}</div>
  </Card>
);

registerComponent("output", "markdown", ({ component, value }) => (
  <div className="tsk-component" data-kind="output" data-type="markdown">
    {component.label && <Label>{component.label}</Label>}
    <MarkdownOutput value={value} />
  </div>
));

registerComponent("output", "json", ({ component, value }) => (
  <div className="tsk-component" data-kind="output" data-type="json">
    {component.label && <Label>{component.label}</Label>}
    <JsonOutput value={value} />
  </div>
));

registerComponent("output", "badge", ({ component, value }) => (
  <div className="tsk-component" data-kind="output" data-type="badge">
    {component.label && <Label>{component.label}</Label>}
    <BadgeOutput value={value} component={component as OutputDef} />
  </div>
));

registerComponent("output", "table", ({ component, value }) => (
  <div className="tsk-component" data-kind="output" data-type="table">
    {component.label && <Label>{component.label}</Label>}
    <TableOutput value={value} />
  </div>
));

registerComponent("output", "chart", ({ component, value }) => (
  <div className="tsk-component" data-kind="output" data-type="chart">
    {component.label && <Label>{component.label}</Label>}
    <ChartOutput value={value} />
  </div>
));
