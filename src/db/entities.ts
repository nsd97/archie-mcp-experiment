import { ddb } from "./client";
import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { nowIso } from "@services/time";
import { generateUlid } from "@services/ids";

export type Entity = {
  entity_key: string; // natural key e.g. slack:U123 or email:foo@bar
  entity_id: string; // ULID
  type: string;
  name?: string;
  email?: string;
  slack_user_id?: string;
  role_subtype?: string;
  status: string;
  created_at: string; // ISO
  updated_at: string; // ISO
  metadata?: Record<string, unknown>;
  external_ids?: Record<string, string>;
};

const ENTITIES_TABLE = process.env.ENTITIES_TABLE || "entities";
const TYPE_STATUS_INDEX = "TypeStatusIndex";

export async function putEntity(
  item: Omit<Entity, "entity_id" | "created_at" | "updated_at"> & Partial<Pick<Entity, "entity_id">>
): Promise<Entity> {
  const now = nowIso();
  const final: Entity = {
    entity_id: item.entity_id ?? generateUlid(),
    created_at: now,
    updated_at: now,
    ...item,
  } as Entity;

  const toPut: any = {
    ...final,
    // GSI: TypeStatusIndex expects SK = status#updated_at
    "status#updated_at": `${final.status}#${final.updated_at}`,
  };

  await ddb.send(new PutCommand({ TableName: ENTITIES_TABLE, Item: toPut }));

  return final;
}

export async function getEntityByKey(entity_key: string): Promise<Entity | undefined> {
  const res = await ddb.send(new GetCommand({ TableName: ENTITIES_TABLE, Key: { entity_key } }));
  return res.Item as Entity | undefined;
}

export async function queryEntitiesByTypeStatus(
  type: string,
  statusPrefix = "",
  limit = 50
): Promise<Entity[]> {
  const res = await ddb.send(
    new QueryCommand({
      TableName: ENTITIES_TABLE,
      IndexName: TYPE_STATUS_INDEX,
      KeyConditionExpression: "#type = :type AND begins_with(#sk, :sk)",
      ExpressionAttributeNames: { "#type": "type", "#sk": "status#updated_at" },
      ExpressionAttributeValues: { ":type": type, ":sk": statusPrefix },
      Limit: limit,
      ScanIndexForward: false,
    })
  );
  return (res.Items as Entity[]) ?? [];
}
