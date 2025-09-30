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
