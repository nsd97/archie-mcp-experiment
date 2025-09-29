import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useOperations } from "./state";
import type { Task } from "./types";
import { categoryTemplates } from "./templates";

type OutputKind = "checkbox" | "text" | "upload";

export const SimpleTaskForm = ({ task, values, onChange }: { task: Task; values?: Record<string, string>; onChange?: (binding: string, value: string) => void }) => {
  const ops = useOperations();

  const template = useMemo(() => {
    const key = task.templateKey;
    if (!key) return undefined;
    const lists = Object.values(categoryTemplates) as Array<readonly {
      key: string;
      title: string;
      defaultType: Task["type"];
      resources?: readonly string[];
      outputs?: readonly { key: string; label: string; kind: OutputKind }[];
    }[]>;
    for (const arr of lists) {
      const found = arr.find((t) => t.key === key);
      if (found) return found;
    }
    return undefined;
  }, [task.templateKey]);

  if (!template) {
    return <div className="text-sm text-muted-foreground">No screen definition for this task yet.</div>;
  }

  const outputs = template.outputs ?? [];
  const getOutputValue = (k: string): any => (values && k in values ? values[k] : (task.outputs?.[k] ?? ""));
  const setOutputValue = (k: string, v: any) => {
    if (onChange) onChange(k, v as string);
    else ops.updateTaskOutput(task.id, k, v as string);
  };

  return (
    <div className="space-y-4">
      {template.resources && template.resources.length > 0 && (
        <div>
          <Label>Resources</Label>
          <ul className="mt-2 list-disc list-inside text-sm text-muted-foreground">
            {template.resources.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {outputs.map((out) => {
        if (out.kind === "checkbox") {
          const checked = Boolean(getOutputValue(out.key));
          return (
            <div key={out.key} className="flex items-center gap-2">
              <Switch
                id={out.key}
                checked={checked}
                onCheckedChange={(c) => setOutputValue(out.key, c ? "true" : "")}
              />
              <Label htmlFor={out.key}>{out.label}</Label>
            </div>
          );
        }
        if (out.kind === "upload") {
          return (
            <div key={out.key} className="space-y-2">
              <Label htmlFor={out.key}>{out.label}</Label>
              <Input
                id={out.key}
                type="file"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  setOutputValue(out.key, file ? file.name : "");
                }}
              />
              <div className="text-xs text-muted-foreground">{String(getOutputValue(out.key) || "")}</div>
            </div>
          );
        }
        return (
          <div key={out.key} className="space-y-2">
            <Label htmlFor={out.key}>{out.label}</Label>
            <Input
              id={out.key}
              value={String(getOutputValue(out.key) ?? "")}
              onChange={(e) => setOutputValue(out.key, e.target.value)}
            />
          </div>
        );
      })}

      <div className="space-y-2">
        <Label htmlFor={`notes_${template.key}`}>Notes</Label>
        <Textarea
          id={`notes_${template.key}`}
          value={String(task.outputs?.[`notes_${template.key}`] ?? "")}
          onChange={(e) => setOutputValue(`notes_${template.key}`, e.target.value)}
        />
      </div>
    </div>
  );
};

export default SimpleTaskForm;


