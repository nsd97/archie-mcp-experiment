/**
 * Tasks & Screens registry.
 *
 * Provides registration and lookup for component renderers, data sources,
 * transforms, and action handlers. The TaskRenderer consumes this registry.
 */
import { createContext, useContext, type ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";
import type {
  ActionDef,
  BindRef,
  ComponentKind,
  ComponentType,
  DataSourceDef,
  DefinedTask,
  InputDef,
  OutputDef,
  PathRef,
  PayloadValue,
} from "./core";

export type TaskComponentProps = {
  component: InputDef | OutputDef;
  value: any;
  onChange?: (value: any) => void;
  readOnly?: boolean;
  form: UseFormReturn<any>;
};

export type ComponentRenderer = (props: TaskComponentProps) => ReactNode;

const componentRegistry = new Map<string, ComponentRenderer>();

const makeKey = (kind: ComponentKind, type: ComponentType) => `${kind}:${type}`;

/** Register a component renderer for a given kind:type pair. */
export function registerComponent(kind: ComponentKind, type: ComponentType, component: ComponentRenderer) {
  componentRegistry.set(makeKey(kind, type), component);
}

/** Look up a previously registered component renderer. */
export function getComponent(kind: ComponentKind, type: ComponentType): ComponentRenderer | undefined {
  return componentRegistry.get(makeKey(kind, type));
}

/* ---------------------------- Data source registry --------------------------- */

export type DataSourceProvider = (params: {
  task: DefinedTask;
  dataSource: DataSourceDef;
  values: Record<string, any>;
  transforms: Record<string, TransformProvider>;
}) => Promise<any> | any;

const dataSourceRegistry = new Map<string, DataSourceProvider>();

/** Register a data source provider by string key. */
export function registerDataSource(provider: string, fn: DataSourceProvider) {
  dataSourceRegistry.set(provider, fn);
}

/** Retrieve a data source provider by key. */
export function getDataSource(provider: string): DataSourceProvider | undefined {
  return dataSourceRegistry.get(provider);
}

/* ---------------------------- Transform registry ---------------------------- */

export type TransformProvider = (params: { value: any; config?: Record<string, unknown> }) => any;

const transformRegistry = new Map<string, TransformProvider>();

/** Register a transform function by string key. */
export function registerTransform(provider: string, fn: TransformProvider) {
  transformRegistry.set(provider, fn);
}

/** Retrieve a transform function by key. */
export function getTransform(provider: string): TransformProvider | undefined {
  return transformRegistry.get(provider);
}

/* ------------------------------ Action registry ----------------------------- */

export type ActionContext = {
  values: Record<string, any>;
  resolve: (v: PayloadValue) => any;
  definition: ActionDef;
};

export type ActionProvider = (ctx: ActionContext) => Promise<void> | void;

const actionRegistry = new Map<string, ActionProvider>();

/** Register an action handler by string key. */
export function registerAction(handler: string, fn: ActionProvider) {
  actionRegistry.set(handler, fn);
}

/** Retrieve an action handler by key. */
export function getAction(handler: string): ActionProvider | undefined {
  return actionRegistry.get(handler);
}

/* -------------------------- Provider context (React) ------------------------- */

const DataRegistryContext = createContext({
  getComponent,
  getDataSource,
  getTransform,
  getAction,
});

/** Context provider exposing registry lookup functions to children. */
export const RegistryProvider = ({ children }: { children: ReactNode }) => (
  <DataRegistryContext.Provider value={{ getComponent, getDataSource, getTransform, getAction }}>
    {children}
  </DataRegistryContext.Provider>
);

/** Convenience hook to access registry lookups. */
export const useRegistry = () => useContext(DataRegistryContext);

/* ------------------------------ Default helpers ------------------------------ */

// Basic passthrough providers used by the renderer when authors do not register custom logic.

registerDataSource("task:binding", ({ dataSource, values }) => {
  const binding = dataSource.config?.binding as string | undefined;
  return binding ? values[binding] : undefined;
});

registerTransform("identity", ({ value }) => value);

const identityAction: ActionProvider = () => undefined;
registerAction("noop", identityAction);
