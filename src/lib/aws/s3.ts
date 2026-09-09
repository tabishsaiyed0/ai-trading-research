import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    // credentials auto-resolved from env / IAM role
  });
}

export async function putJsonToS3(key: string, data: unknown) {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET!;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
    })
  );
  return `s3://${bucket}/${key}`;
}

export async function getJsonFromS3<T>(key: string): Promise<T> {
  const client = getS3Client();
  const bucket = process.env.AWS_S3_BUCKET!;
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = await res.Body?.transformToString();
  return JSON.parse(body || "null") as T;
}
