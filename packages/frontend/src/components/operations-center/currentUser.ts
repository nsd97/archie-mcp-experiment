/**
 * Current Operations user configuration.
 *
 * The backend expects us to identify the acting user via the X-Debug-User
 * header. Expose a shared constant so the UI and API client stay in sync.
 */
export const CURRENT_OPERATIONS_USER_ID = (import.meta.env.VITE_OPERATIONS_USER_ID as string | undefined) ?? "agent-noah";
export const CURRENT_OPERATIONS_USER = {
  userId: CURRENT_OPERATIONS_USER_ID,
  email: `${CURRENT_OPERATIONS_USER_ID}@example.com`,
  name: "Noah Deskin",
  groups: ["BOTH"],
  roles: [],
};

export const FALLBACK_OPERATIONS_USER = {
  userId: "agent-default",
  email: "agent-default@example.com",
  name: "Default Agent",
  groups: ["BOTH"],
  roles: [],
};

export function resolveCurrentUser() {
  try {
    const raw = import.meta.env.VITE_OPERATIONS_USER;
    if (typeof raw === "string" && raw.trim().length > 0) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && typeof parsed.userId === "string") {
        return {
          userId: parsed.userId,
          email: typeof parsed.email === "string" ? parsed.email : `${parsed.userId}@example.com`,
          name: typeof parsed.name === "string" ? parsed.name : parsed.userId,
          groups: Array.isArray(parsed.groups) && parsed.groups.length ? parsed.groups : FALLBACK_OPERATIONS_USER.groups,
          roles: Array.isArray(parsed.roles) && parsed.roles.length ? parsed.roles : FALLBACK_OPERATIONS_USER.roles,
        };
      }
    }
  } catch (err) {
    console.warn("Failed to parse VITE_OPERATIONS_USER", err);
  }
  return CURRENT_OPERATIONS_USER;
}

export const CURRENT_USER_RUNTIME = resolveCurrentUser();
export const CURRENT_USER_ID_RUNTIME = CURRENT_USER_RUNTIME.userId;
export const CURRENT_USER_GROUPS_RUNTIME = CURRENT_USER_RUNTIME.groups;

export function buildOperationsDebugUserHeader(overrides?: Partial<typeof CURRENT_OPERATIONS_USER>) {
  const merged = { ...CURRENT_USER_RUNTIME, ...overrides };
  return JSON.stringify(merged);
}
