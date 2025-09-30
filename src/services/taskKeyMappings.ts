/**
 * Mapping from high-level classification keys (group_key, task_key) to
 * concrete task definitions and default titles. Keep this deliberately small
 * and safe — unknown keys will gracefully degrade to generic tasks without
 * a task_def_id, so downstream validation will not break.
 */

export type MappedTask = {
  /** Optional concrete task definition ID (e.g., "SALE::BOOK_PHOTOS"). */
  defId?: string;
  /** Human-readable title for the task if no definition is present. */
  title: string;
};

/** Expand a group_key into a list of default tasks for that group. */
export function expandGroupKeyToTasks(groupKey: string): MappedTask[] {
  switch (groupKey) {
    case "SALE_LISTING":
      return [
        { defId: "SALE::BOOK_PHOTOS", title: "Book Photos" },
        { title: "Prepare Sale Listing" },
      ];
    case "LEASE_LISTING":
      return [
        { defId: "LEASE::PREP_LISTING", title: "Prepare Lease Listing" },
      ];
    default:
      return [];
  }
}

/** Map a stray task_key to a concrete task (if known). */
export function mapTaskKey(taskKey: string): MappedTask {
  switch (taskKey) {
    case "SALE_CLOSING_TASKS":
      // Use an existing definition as a reasonable placeholder action.
      return { defId: "SALE::BOOK_PHOTOS", title: "Sale Closing Checklist" };
    case "SALE_ACTIVE_TASKS":
      return { title: "Sale Active Tasks" };
    case "SALE_SOLD_TASKS":
      return { title: "Sale Sold Tasks" };

    case "LEASE_ACTIVE_TASKS":
      return { title: "Lease Active Tasks" };
    case "LEASE_LEASED_TASKS":
      return { title: "Lease Leased Tasks" };
    case "LEASE_CLOSING_TASKS":
      return { title: "Lease Closing Tasks" };
    case "LEASE_ACTIVE_TASKS_ARLYN":
      return { title: "Lease Active Tasks – Arlyn" };

    case "RELIST_LISTING_DEAL_SALE":
      return { title: "Relist Listing Deal (Sale)" };
    case "RELIST_LISTING_DEAL_LEASE":
      return { title: "Relist Listing Deal (Lease)" };

    case "BUYER_DEAL":
      return { title: "Buyer Deal" };
    case "BUYER_DEAL_CLOSING_TASKS":
      return { title: "Buyer Deal Closing Tasks" };

    case "LEASE_TENANT_DEAL":
      return { title: "Lease Tenant Deal" };
    case "LEASE_TENANT_DEAL_CLOSING_TASKS":
      return { title: "Lease Tenant Deal Closing Tasks" };

    case "PRECON_DEAL":
      return { title: "Pre-Con Deal" };
    case "MUTUAL_RELEASE_STEPS":
      return { title: "Mutual Release Steps" };

    case "BROCHURE_REQUEST":
      return { title: "Create Listing Brochure" };

    default:
      return { title: taskKey };
  }
}


