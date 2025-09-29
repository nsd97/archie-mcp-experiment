export type UserContext = {
  userId: string;
  roles: string[];
  groups: string[];
  provider?: string;
};

const DEFAULT_VISIBILITY_GROUP = 'BOTH';

function normalize(value?: string | string[]): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flatMap((v) => String(v).split(','))
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  }
  return String(value)
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
}

export function getUserContext(req: { user?: { userId: string; roles?: string[]; groups?: string[]; provider?: string } }): UserContext | undefined {
  if (!req.user?.userId) return undefined;
  return {
    userId: req.user.userId,
    roles: normalize(req.user.roles),
    groups: normalize(req.user.groups),
    provider: req.user.provider,
  };
}

export function hasRole(user: UserContext | undefined, role: string): boolean {
  if (!user) return false;
  return user.roles.includes(role.toUpperCase());
}

export function hasGroup(user: UserContext | undefined, group: string): boolean {
  if (!user) return false;
  const normalized = group.toUpperCase();
  return user.groups.includes(normalized) || normalized === DEFAULT_VISIBILITY_GROUP;
}

export function canSeeTask(user: UserContext | undefined, visibilityGroup?: string): boolean {
  if (!visibilityGroup) return true;
  if (!user) return false;
  const group = visibilityGroup.toUpperCase();
  if (group === DEFAULT_VISIBILITY_GROUP) return true;
  return user.groups.includes(group);
}

export function assertCanSeeTask(user: UserContext | undefined, visibilityGroup?: string): void {
  if (!canSeeTask(user, visibilityGroup)) {
    const err = new Error('forbidden');
    (err as any).statusCode = 403;
    throw err;
  }
}

export function canClaimTask(user: UserContext | undefined, task: { assigned_to?: { userId?: string }; visibility_group?: string }): boolean {
  if (!user) return false;
  if (!canSeeTask(user, task.visibility_group)) return false;
  if (!task.assigned_to?.userId) {
    // Unassigned tasks can be claimed by anyone in visibility group
    return true;
  }
  // Already assigned: only the assignee or admins can re-claim
  return task.assigned_to.userId === user.userId || hasRole(user, 'ADMIN_OPS') || hasRole(user, 'ADMIN_MARKETING');
}

export function canUnclaimTask(user: UserContext | undefined, task: { assigned_to?: { userId?: string }; visibility_group?: string }): boolean {
  if (!user) return false;
  if (!canSeeTask(user, task.visibility_group)) return false;
  if (!task.assigned_to?.userId) return false;
  // Only admins or current assignee can unclaim
  return task.assigned_to.userId === user.userId || hasRole(user, 'ADMIN_OPS') || hasRole(user, 'ADMIN_MARKETING');
}

export function canCompleteTask(user: UserContext | undefined, task: { assigned_to?: { userId?: string }; visibility_group?: string }): boolean {
  if (!user) return false;
  if (!canSeeTask(user, task.visibility_group)) return false;
  if (!task.assigned_to?.userId) {
    return hasRole(user, 'ADMIN_OPS') || hasRole(user, 'ADMIN_MARKETING');
  }
  return task.assigned_to.userId === user.userId || hasRole(user, 'ADMIN_OPS') || hasRole(user, 'ADMIN_MARKETING');
}

