// =======================================================
// React Tasks & Screens — Inference-First, Stringless Refs
// =======================================================
// This module defines the authoring DSL and compile-time checks used by
// task/screen definitions. It emphasizes type inference and validation.

/** Domain terms */
export type ComponentKind = "input" | "output";
export type InputType = "text" | "number" | "select" | "date" | "toggle" | "file";
export type OutputType = "table" | "chart" | "markdown" | "json" | "badge";
export type ComponentType = InputType | OutputType;
export type Department = "marketing" | "admin";

/** VisibleWhen shape (authors write JSON-like conditions) */
export type VisibleWhen =
  | { binding: string; equals: unknown }
  | { binding: string; notEquals: unknown }
  | { and: VisibleWhen[] }
  | { or: VisibleWhen[] };

/** Component defs */
export type BaseComponentDef = {
  id: string;
  kind: ComponentKind;
  type: ComponentType;
  label?: string;
  description?: string;
  binding?: string; // data key (optional for certain outputs)
  config?: Record<string, unknown>;
  visibleWhen?: VisibleWhen;
};

export type InputDef = BaseComponentDef & {
  kind: "input";
  type: InputType;
  required?: boolean;
  defaultValue?: unknown;
};

export type OutputDef = BaseComponentDef & {
  kind: "output";
  type: OutputType;
  dataSource?: string;
  transform?: string;
};

export type ScreenLayout =
  | { kind: "stack" }
  | { kind: "grid"; columns: string; rows?: string; areas?: Record<string, string> };

export type ScreenDraft<Comps extends readonly (InputDef | OutputDef)[]> = {
  id: string;
  title?: string;
  layout?: ScreenLayout;
  components: Comps; // keep tuple via `as const` for best checking
};

/** Actions with type-safe payload references */
export type BindRef<K extends string = string> = { __kind: "bind"; key: K };
export type PathRef<K extends string = string, P extends readonly string[] = readonly string[]> = {
  __kind: "path";
  root: K;
  path: P;
};

export const bind = <K extends string>(key: K): BindRef<K> => ({ __kind: "bind", key });
export const path = <K extends string, P extends string[]>(root: K, ...p: P): PathRef<K, Readonly<P>> => ({
  __kind: "path",
  root,
  path: p,
});

export type PayloadValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: PayloadValue }
  | PayloadValue[]
  | BindRef
  | PathRef;

export type ActionDef = {
  id: string;
  label: string;
  intent?: "primary" | "secondary" | "danger";
  handler: string; // provider key
  payload?: Record<string, PayloadValue>; // use bind()/path() for references
  confirm?: string;
  successToast?: string;
  errorToast?: string;
  visibleWhen?: VisibleWhen;
};

/** Data sources / transforms */
export type DataSourceDef = {
  id: string;
  provider: string;
  config?: Record<string, unknown>;
  refreshMs?: number;
};

export type TransformDef = {
  id: string;
  provider: string;
  config?: Record<string, unknown>;
};

/** Task authoring shape (what authors write) */
export type TaskDraft<Comps extends readonly (InputDef | OutputDef)[]> = {
  version: number;
  id: string;
  name: string;
  description?: string;
  taskGroupId?: string; // undefined ⇒ Stray
  order: number; // position within group
  department: Department;
  screen: ScreenDraft<Comps>;
  dataSources?: readonly DataSourceDef[];
  transforms?: readonly TransformDef[];
  actions?: readonly ActionDef[];
  meta?: Record<string, unknown>;
};

/* ----------------------- Type-level inference & checks ----------------------- */
// The types below assert unique bindings, valid dataSource references,
// and that visibleWhen/payload bindings exist in the components tuple.

type Components<T> = T extends { screen: { components: infer C } } ? C : never;
type Outputs<T> = Extract<Components<T>[number], { kind: "output" }>;
type BindingUnion<T> = Extract<Components<T>[number], { binding: string }> extends infer X
  ? X extends { binding: infer B extends string }
    ? B
    : never
  : never;

/** Duplicate binding detection across the components tuple */
type BindingsTuple<T> = {
  [K in keyof Components<T>]: Components<T>[K] extends { binding: infer B extends string } ? B : never;
};

type Includes<T extends readonly unknown[], V> = T extends readonly [infer H, ...infer R]
  ? [V] extends [H]
    ? true
    : Includes<R, V>
  : false;

type IsUnique<T extends readonly unknown[], Seen extends readonly unknown[] = []> = T extends readonly [
  infer H,
  ...infer R
]
  ? Includes<Seen, H> extends true
    ? false
    : IsUnique<R, [...Seen, H]>
  : true;

type CheckBindingsUnique<T> = IsUnique<BindingsTuple<T>> extends true
  ? {}
  : { __error_duplicate_bindings__: never };

/** Outputs must reference existing dataSource ids */
type DataSourceIds<T> = T extends { dataSources: readonly (infer D)[] }
  ? D extends { id: infer I extends string }
    ? I
    : never
  : never;

type OutputDataSourceRefs<T> = Outputs<T> extends { dataSource: infer DS extends string } ? DS : never;

type CheckOutputDataSourcesExist<T> = Exclude<OutputDataSourceRefs<T>, DataSourceIds<T>> extends never
  ? {}
  : { __error_unknown_dataSource_ids__: never };

/** visibleWhen must reference existing bindings (recursively) */
type VWBindings<V> = V extends { binding: infer B extends string }
  ? B
  : V extends { and: infer L }
  ? VWBindings<L[number]>
  : V extends { or: infer R }
  ? VWBindings<R[number]>
  : never;

type AllVWBindingsInTask<T> =
  | (Components<T>[number] extends infer C
      ? C extends { visibleWhen?: infer V }
        ? VWBindings<NonNullable<V>>
        : never
      : never)
  | (T extends { actions: readonly (infer A)[] }
      ? A extends { visibleWhen?: infer V }
        ? VWBindings<NonNullable<V>>
        : never
      : never);

type CheckVisibleWhenBindings<T> = Exclude<AllVWBindingsInTask<T>, BindingUnion<T>> extends never
  ? {}
  : { __error_unknown_visibleWhen_binding__: never };

/** Payload must reference existing bindings via bind()/path() */
type PayloadBindings<V> = V extends BindRef
  ? V["key"]
  : V extends PathRef
  ? V["root"]
  : V extends readonly unknown[]
  ? PayloadBindings<V[number]>
  : V extends Record<string, unknown>
  ? PayloadBindings<V[keyof V]>
  : never;

type AllPayloadBindingsInTask<T> = T extends { actions: readonly (infer A)[] }
  ? A extends { payload?: infer P }
    ? PayloadBindings<NonNullable<P>>
    : never
  : never;

type CheckPayloadBindings<T> = Exclude<AllPayloadBindingsInTask<T>, BindingUnion<T>> extends never
  ? {}
  : { __error_unknown_payload_binding__: never };

/* ------------------------------ defineTask API ------------------------------ */

export function defineTask<const T extends TaskDraft<readonly (InputDef | OutputDef)[]>>(
  t: T &
    CheckBindingsUnique<T> &
    CheckOutputDataSourcesExist<T> &
    CheckVisibleWhenBindings<T> &
    CheckPayloadBindings<T>
) {
  return t;
}

export type DefinedTask = ReturnType<typeof defineTask>;

/* ------------------------------ Runtime helpers ----------------------------- */

export function evalVisibleWhen(vw: VisibleWhen, values: Record<string, any>): boolean {
  if ("and" in vw) return vw.and.every((c) => evalVisibleWhen(c, values));
  if ("or" in vw) return vw.or.some((c) => evalVisibleWhen(c, values));
  const val = values[vw.binding];
  if ("equals" in vw) return Object.is(val, vw.equals);
  if ("notEquals" in vw) return !Object.is(val, vw.notEquals);
  return true;
}

export function resolvePayload(v: PayloadValue, values: Record<string, any>): any {
  if (Array.isArray(v)) return v.map((x) => resolvePayload(x, values));
  if (v && typeof v === "object") {
    if ((v as any).__kind === "bind") return values[(v as BindRef).key];
    if ((v as any).__kind === "path") {
      const { root, path: pathParts } = v as PathRef;
      return pathParts.reduce((acc, seg) => (acc == null ? undefined : acc[seg]), values[root]);
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = resolvePayload((v as any)[k], values);
    return out;
  }
  return v;
}
