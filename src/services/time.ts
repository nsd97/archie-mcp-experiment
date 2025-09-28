export function nowIso(): string {
  return new Date().toISOString();
}

export function toIso(d: Date | number | string): string {
  return new Date(d).toISOString();
}
