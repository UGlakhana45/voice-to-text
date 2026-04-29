import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { env } from './env.js';

export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

let bucketReady: Promise<void> | null = null;

export function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      try {
        await s3.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
      } catch {
        try {
          await s3.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[s3] bucket create failed (may already exist):', (e as Error).message);
        }
      }
    })();
  }
  return bucketReady;
}

export async function presignPut(key: string, contentType: string, ttlSeconds = 600) {
  await ensureBucket();
  const cmd = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSeconds });
}

export async function presignGet(key: string, ttlSeconds = 600) {
  const cmd = new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn: ttlSeconds });
}
