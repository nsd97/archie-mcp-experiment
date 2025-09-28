import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const REGION = process.env.AWS_REGION || "us-east-1";
const LOCALSTACK = process.env.LOCALSTACK_ENDPOINT || process.env.DYNAMO_ENDPOINT || "";

const baseClient = new DynamoDBClient({
  region: REGION,
  ...(LOCALSTACK
    ? {
        endpoint: LOCALSTACK,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
        },
      }
    : {}),
});

export const ddb = DynamoDBDocumentClient.from(baseClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

export default ddb;
