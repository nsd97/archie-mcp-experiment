import { SQSClient } from "@aws-sdk/client-sqs";

const REGION = process.env.AWS_REGION || "us-east-1";
const isLocal = process.env.NODE_ENV === "local" || process.env.NODE_ENV === "test";
const LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || "http://localhost:4566";

const sqs = new SQSClient({
  region: REGION,
  ...(isLocal
    ? {
        endpoint: LOCALSTACK_ENDPOINT,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
        },
      }
    : {}),
});

export default sqs;

