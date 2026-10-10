import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ObjectStorage {
  upload(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string>;
  putObject(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string>;
  getObject(key: string): Promise<{ data: Buffer; mimeType: string } | null>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getSignedUploadUrl(key: string, mimeType: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  checkHealth?(): Promise<{ ok: boolean; message?: string }>;
}

export interface S3StorageConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  forcePathStyle?: boolean;
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || 'us-east-1',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: config.forcePathStyle ?? true,
    });
  }

  async upload(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: mimeType,
      }),
    );
    return `s3://${this.bucket}/${key}`;
  }

  async putObject(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string> {
    return this.upload(key, data, mimeType);
  }

  async getObject(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );

      if (!response.Body) {
        return null;
      }

      const bytes = await response.Body.transformToByteArray();
      return {
        data: Buffer.from(bytes),
        mimeType: response.ContentType || 'application/octet-stream',
      };
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw err;
    }
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async getSignedUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (err: unknown) {
      const error = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (
        error.name === 'NotFound' ||
        error.name === 'NoSuchKey' ||
        error.$metadata?.httpStatusCode === 404
      ) {
        return false;
      }
      throw err;
    }
  }

  async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    try {
      await this.client.send(
        new HeadBucketCommand({
          Bucket: this.bucket,
        }),
      );
      return { ok: true };
    } catch (err: unknown) {
      return { ok: false, message: (err as Error).message };
    }
  }
}

export class InMemoryObjectStorage implements ObjectStorage {
  private files: Map<string, { data: Uint8Array | Buffer; mimeType: string }> = new Map();

  async upload(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string> {
    this.files.set(key, { data, mimeType });
    return `memory://${key}`;
  }

  async putObject(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string> {
    return this.upload(key, data, mimeType);
  }

  async getObject(key: string): Promise<{ data: Buffer; mimeType: string } | null> {
    const item = this.files.get(key);
    if (!item) return null;
    return { data: Buffer.from(item.data), mimeType: item.mimeType };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `https://storage.campusflow.internal/download/${encodeURIComponent(key)}?expires=${expires}`;
  }

  async getSignedUploadUrl(
    key: string,
    _mimeType: string,
    expiresInSeconds = 3600,
  ): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return `https://storage.campusflow.internal/upload/${encodeURIComponent(key)}?expires=${expires}`;
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }

  async checkHealth(): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  clear(): void {
    this.files.clear();
  }
}

export function createObjectStorageFromEnv(): ObjectStorage {
  if (
    process.env.NODE_ENV !== 'test' &&
    process.env.STORAGE_USE_IN_MEMORY !== 'true' &&
    process.env.STORAGE_ENDPOINT &&
    process.env.STORAGE_BUCKET &&
    process.env.STORAGE_ACCESS_KEY &&
    process.env.STORAGE_SECRET_KEY
  ) {
    return new S3ObjectStorage({
      endpoint: process.env.STORAGE_ENDPOINT,
      bucket: process.env.STORAGE_BUCKET,
      accessKeyId: process.env.STORAGE_ACCESS_KEY,
      secretAccessKey: process.env.STORAGE_SECRET_KEY,
      region: process.env.STORAGE_REGION || 'us-east-1',
      forcePathStyle:
        process.env.STORAGE_FORCE_PATH_STYLE === 'true' ||
        process.env.STORAGE_FORCE_PATH_STYLE === undefined,
    });
  }
  return new InMemoryObjectStorage();
}
