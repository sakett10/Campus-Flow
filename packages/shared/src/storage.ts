export interface ObjectStorage {
  upload(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string>;
  putObject(key: string, data: Uint8Array | Buffer, mimeType: string): Promise<string>;
  getObject(key: string): Promise<{ data: Buffer; mimeType: string } | null>;
  getSignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getSignedUploadUrl(key: string, mimeType: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
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

  clear(): void {
    this.files.clear();
  }
}
