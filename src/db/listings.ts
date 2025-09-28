import { ddb } from "./client";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { nowIso } from "@services/time";
import { generateUlid } from "@services/ids";

export type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
};

export type Listing = {
  listing_id: string; // ULID
  due_date?: string;
  type: "SALE" | "LEASE";
  address?: Address;
  address_string?: string;
  agent_id?: string;
  assignee?: string;
  status: string;
  property_type?: string;
  lockbox_code?: string;
  lockbox_location?: string;
  documents?: Record<string, unknown>;
  task_template_version?: number;
  progress?: Record<string, unknown>;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  year_built?: number;
  list_price?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  tags?: string[];
};

const LISTINGS_TABLE = process.env.LISTINGS_TABLE || "listings";

export async function putListing(item: Omit<Listing, "listing_id" | "created_at" | "updated_at"> & Partial<Pick<Listing, "listing_id">>): Promise<Listing> {
  const now = nowIso();
  const final: Listing = {
    listing_id: item.listing_id ?? generateUlid(),
    created_at: now,
    updated_at: now,
    ...item,
  } as Listing;
  const toPut: any = { ...final, GLOBAL: "GLOBAL" };
  await ddb.send(new PutCommand({ TableName: LISTINGS_TABLE, Item: toPut }));
  return toPut as Listing;
}

export async function getListingById(listing_id: string): Promise<Listing | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: LISTINGS_TABLE, Key: { listing_id } }));
  return res.Item as Listing | undefined;
}

// GSIs
// StatusIndex: PK status, SK due_date
export async function queryListingsByStatus(status: string, dueDateFrom = "", limit = 50): Promise<Listing[]> {
  const hasFrom = typeof dueDateFrom === "string" && dueDateFrom.length > 0;
  const params: any = {
    TableName: LISTINGS_TABLE,
    IndexName: "StatusIndex",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": status },
    Limit: limit,
  };
  if (hasFrom) {
    params.KeyConditionExpression = "#status = :status AND begins_with(#due, :from)";
    params.ExpressionAttributeNames["#due"] = "due_date";
    params.ExpressionAttributeValues[":from"] = dueDateFrom;
  } else {
    params.KeyConditionExpression = "#status = :status";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as Listing[]) ?? [];
}

// AgentIndex: PK agent_id, SK due_date
export async function queryListingsByAgent(agent_id: string, dueDateFrom = "", limit = 50): Promise<Listing[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: LISTINGS_TABLE,
      IndexName: "AgentIndex",
      KeyConditionExpression: "#agent = :agent AND begins_with(#due, :from)",
      ExpressionAttributeNames: { "#agent": "agent_id", "#due": "due_date" },
      ExpressionAttributeValues: { ":agent": agent_id, ":from": dueDateFrom },
      Limit: limit,
    })
  );
  return (res.Items as Listing[]) ?? [];
}

// TypeDueDateIndex: PK type, SK due_date
export async function queryListingsByTypeDueDate(type: "SALE" | "LEASE", dueDateFrom = "", limit = 50): Promise<Listing[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: LISTINGS_TABLE,
      IndexName: "TypeDueDateIndex",
      KeyConditionExpression: "#type = :type AND begins_with(#due, :from)",
      ExpressionAttributeNames: { "#type": "type", "#due": "due_date" },
      ExpressionAttributeValues: { ":type": type, ":from": dueDateFrom },
      Limit: limit,
    })
  );
  return (res.Items as Listing[]) ?? [];
}

// AddressSearchIndex: PK GLOBAL, SK address_string
export async function queryListingsByAddress(addressPrefix = "", limit = 50): Promise<Listing[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: LISTINGS_TABLE,
      IndexName: "AddressSearchIndex",
      KeyConditionExpression: "#pk = :global AND begins_with(#addr, :prefix)",
      ExpressionAttributeNames: { "#pk": "GLOBAL", "#addr": "address_string" },
      ExpressionAttributeValues: { ":global": "GLOBAL", ":prefix": addressPrefix },
      Limit: limit,
    })
  );
  return (res.Items as Listing[]) ?? [];
}

// CreatedAtIndex: PK GLOBAL, SK created_at
export async function queryListingsByCreatedAt(createdAtFrom = "", limit = 50): Promise<Listing[]> {
  const hasFrom = typeof createdAtFrom === "string" && createdAtFrom.length > 0;
  const params: any = {
    TableName: LISTINGS_TABLE,
    IndexName: "CreatedAtIndex",
    ExpressionAttributeNames: { "#pk": "GLOBAL" },
    ExpressionAttributeValues: { ":global": "GLOBAL" },
    Limit: limit,
    ScanIndexForward: false,
  };
  if (hasFrom) {
    params.KeyConditionExpression = "#pk = :global AND begins_with(#created, :from)";
    params.ExpressionAttributeNames["#created"] = "created_at";
    params.ExpressionAttributeValues[":from"] = createdAtFrom;
  } else {
    params.KeyConditionExpression = "#pk = :global";
  }
  const res = await ddb.send(new QueryCommand(params));
  return (res.Items as Listing[]) ?? [];
}
