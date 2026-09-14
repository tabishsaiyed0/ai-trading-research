import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

export function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
  });
}


export function isS3Configured(): boolean {
  const bucket = process.env.AWS_S3_BUCKET;
  if (!bucket) return false;
  const hasKeys = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  const hasProfile = !!process.env.AWS_PROFILE;
  const hasRole = process.env.NODE_ENV === "production"; // ECS/Lambda/EC2 IAM role
  return hasKeys || hasProfile || hasRole;
}

function isCredentialsError(e: unknown): boolean {
  const name = (e as { name?: string })?.name ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  return (
    name.includes("Credentials") ||
    msg.includes("Could not load credentials") ||
    msg.includes("Missing credentials")
  );
}

export async function putJsonToS3(key: string, data: unknown): Promise<string | null> {
  if (!isS3Configured()) return null;
  try {
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
  } catch (e) {
    if (!isCredentialsError(e) && process.env.S3_VERBOSE === "1") {
      console.warn("[s3] put failed", e instanceof Error ? e.message : e);
    }
    return null;
  }
}

export async function getJsonFromS3<T>(key: string): Promise<T | null> {
  if (!isS3Configured()) return null;
  try {
    const client = getS3Client();
    const bucket = process.env.AWS_S3_BUCKET!;
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const body = await res.Body?.transformToString();
    return JSON.parse(body || "null") as T;
  } catch {
    return null;
  }
}
