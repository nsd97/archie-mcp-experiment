/**
 * TaskRenderer — renders a task definition into interactive UI.
 *
 * Uses react-hook-form to manage values; looks up component/data/transform/action
 * providers from the registry. Designed to be data-driven and extensible.
 */
import { useEffect, useMemo } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { DefinedTask, InputDef, OutputDef } from "./core";
import { evalVisibleWhen, resolvePayload } from "./core";
import { getComponent, getDataSource, getTransform, getAction } from "./registry";
import "./styles.css";

export type TaskRendererProps = {
  /** Task definition to render */
  task: DefinedTask;
  /** Initial values to seed the form (e.g., from task.inputs/outputs) */
  values?: Record<string, any>;
  /** Notify parent when a bound value changes */
  onValueChange?: (binding: string, value: any) => void;
  /** When true, render as read-only (components should ignore changes) */
  readOnly?: boolean;
};

export function TaskRenderer({ task, values, onValueChange, readOnly }: TaskRendererProps) {
  const form = useForm({
    defaultValues: values ?? {},
  });

  // Keep form in sync when `values` prop changes
  useEffect(() => {
    if (values) {
      form.reset(values);
    }
  }, [values, form]);

  // watchAll triggers re-renders when any bound value changes. Be careful with
  // expensive derived computations — memoize where possible.
  const watchAll = form.watch();
  const { toast } = useToast();

  // Build transform lookup once per task definition
  const transforms = useMemo(() => {
    const entries = task.transforms?.map((t) => [t.id, getTransform(t.provider)]) ?? [];
    return Object.fromEntries(entries);
  }, [task.transforms]);

  const resolvedActions = task.actions ?? [];

  const renderComponent = (component: InputDef | OutputDef) => {
    const binding = component.binding;
    // Visibility conditions are evaluated using current form values
    const visible = component.visibleWhen ? evalVisibleWhen(component.visibleWhen, watchAll) : true;
    if (!visible) return null;

    const renderer = getComponent(component.kind, component.type);
    if (!renderer) {
      return (
        <div className="tsk-component tsk-component--missing" key={component.id}>
          Missing renderer for {component.kind}:{component.type}
        </div>
      );
    }

    const value = binding ? watchAll[binding] : undefined;

    const handleChange = (next: any) => {
      if (!binding) return;
      form.setValue(binding as any, next, { shouldDirty: true });
      onValueChange?.(binding, next);
    };

    let displayValue = value;
    // Outputs may reference a data source and optional transform
    if (component.kind === "output" && (component as OutputDef).dataSource) {
      const dataSourceId = (component as OutputDef).dataSource!;
      const dsDef = task.dataSources?.find((d) => d.id === dataSourceId);
      if (dsDef) {
        const provider = getDataSource(dsDef.provider);
        if (provider) {
          try {
            const raw = provider({ task, dataSource: dsDef, values: watchAll, transforms });
            const transformId = (component as OutputDef).transform;
            if (transformId) {
              const transformDef = task.transforms?.find((t) => t.id === transformId);
              const transformFn = transformDef ? getTransform(transformDef.provider) : undefined;
              displayValue = transformFn ? transformFn({ value: raw, config: transformDef?.config }) : raw;
            } else {
              displayValue = raw;
            }
          } catch (err) {
            displayValue = `Error resolving data source: ${(err as Error).message}`;
          }
        }
      }
    }

    return (
      <div key={component.id} className="tsk-component-wrapper">
        {renderer({ component, value: displayValue, onChange: handleChange, readOnly, form })}
      </div>
    );
  };

  const layout = task.screen.layout ?? { kind: "stack" };
  const layoutProps =
    layout.kind === "grid"
      ? {
          display: "grid",
          gridTemplateColumns: layout.columns,
          gridTemplateRows: layout.rows,
        }
      : {
          display: "flex",
          flexDirection: "column" as const,
        };

  const handleAction = async (actionId: string) => {
    const action = resolvedActions.find((a) => a.id === actionId);
    if (!action) return;
    const provider = getAction(action.handler);
    if (!provider) {
      toast({ title: "Missing action provider", description: action.handler, variant: "destructive" });
      return;
    }

    if (action.confirm && !window.confirm(action.confirm)) {
      return;
    }

    try {
      await provider({
        values: watchAll,
        resolve: (v) => resolvePayload(v, watchAll),
        definition: action,
      });
      if (action.successToast) {
        toast({ title: action.successToast });
      }
    } catch (error) {
      toast({
        title: action.errorToast || "Action failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };

  return (
    <FormProvider {...form}>
      <div className="tsk-root" data-layout={layout.kind} style={layoutProps as React.CSSProperties}>
        {task.screen.title && <h3 className="text-base font-semibold">{task.screen.title}</h3>}
        {task.screen.components.map(renderComponent)}
        {resolvedActions.length > 0 && (
          <div className="tsk-actions">
            {resolvedActions.map((action) => {
              const visible = action.visibleWhen ? evalVisibleWhen(action.visibleWhen, watchAll) : true;
              if (!visible) return null;
              return (
                <Button
                  key={action.id}
                  className="tsk-action-button"
                  variant={action.intent === "secondary" ? "outline" : action.intent === "danger" ? "destructive" : "default"}
                  onClick={() => handleAction(action.id)}
                >
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </FormProvider>
  );
}
