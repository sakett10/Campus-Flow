import crypto from 'node:crypto';
import type { FileValidationResult } from '@campusflow/types';
import { AppError } from '../errors.js';

export const INGESTION_LIMITS = {
  MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50 MB
  MAX_PDF_PAGES: 100,
  EXTRACTION_TIMEOUT_MS: 30000, // 30 seconds
  MAX_FILENAME_LENGTH: 255,
  MAX_BATCH_FILE_COUNT: 10,
  MAX_BATCH_TOTAL_BYTES: 100 * 1024 * 1024, // 100 MB aggregate
} as const;

export const SUPPORTED_MIME_TYPES = ['application/pdf', 'text/plain', 'text/markdown'] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

// Dangerous executable signatures to immediately reject
const EXECUTABLE_MAGIC_BYTES = [
  { name: 'Windows PE/EXE', bytes: [0x4d, 0x5a] }, // MZ
  { name: 'Linux ELF', bytes: [0x7f, 0x45, 0x4c, 0x46] }, // .ELF
  { name: 'Mach-O 32', bytes: [0xfe, 0xed, 0xfa, 0xce] },
  { name: 'Mach-O 64', bytes: [0xfe, 0xed, 0xfa, 0xcf] },
  { name: 'Java Class', bytes: [0xca, 0xfe, 0xba, 0xbe] },
];

/**
 * Normalizes a user-supplied filename: removes path traversal, control chars,
 * trims, and enforces max length.
 */
export function normalizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    return 'untitled_document.pdf';
  }

  // Strip path traversal attempts and directory separators
  const baseName = fileName.replace(/^.*[\\/]/, '');
  // Strip control chars and non-printable characters
  // eslint-disable-next-line no-control-regex
  const cleanName = baseName.replace(/[\x00-\x1f\x80-\x9f]/g, '').trim();

  if (!cleanName) {
    return 'document.pdf';
  }

  if (cleanName.length > INGESTION_LIMITS.MAX_FILENAME_LENGTH) {
    const extIndex = cleanName.lastIndexOf('.');
    if (extIndex !== -1 && extIndex > cleanName.length - 10) {
      const ext = cleanName.slice(extIndex);
      const prefix = cleanName.slice(0, INGESTION_LIMITS.MAX_FILENAME_LENGTH - ext.length);
      return `${prefix}${ext}`;
    }
    return cleanName.slice(0, INGESTION_LIMITS.MAX_FILENAME_LENGTH);
  }

  return cleanName;
}

/**
 * Computes a deterministic cryptographic SHA-256 hash of file bytes.
 */
export function computeContentHash(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

export interface ValidateFileOptions {
  buffer: Buffer;
  originalFileName: string;
  declaredMimeType?: string;
  maxSizeBytes?: number;
}

/**
 * Inspects raw buffer bytes to detect magic signatures and reject hostile input.
 */
export function validateFileBytes(
  bufferOrOptions: Buffer | ValidateFileOptions,
  maybeFileName?: string,
): FileValidationResult {
  let buffer: Buffer;
  let declaredFileName: string;
  let customMaxSize: number | undefined;

  if (Buffer.isBuffer(bufferOrOptions)) {
    buffer = bufferOrOptions;
    declaredFileName = maybeFileName || 'document.pdf';
  } else {
    buffer = bufferOrOptions.buffer;
    declaredFileName = bufferOrOptions.originalFileName;
    customMaxSize = bufferOrOptions.maxSizeBytes;
  }

  const normalizedName = normalizeFileName(declaredFileName);
  const sizeBytes = buffer.length;
  const effectiveMaxSize = customMaxSize || INGESTION_LIMITS.MAX_FILE_SIZE_BYTES;

  // 1. Check size limit
  if (sizeBytes > effectiveMaxSize) {
    return {
      isValid: false,
      detectedMimeType: 'unknown',
      fileExtension: '',
      sizeBytes,
      normalizedFileName: normalizedName,
      contentHash: '',
      error: `File size (${(sizeBytes / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed size of ${(effectiveMaxSize / (1024 * 1024)).toFixed(2)} MB.`,
    };
  }

  if (sizeBytes === 0) {
    return {
      isValid: false,
      detectedMimeType: 'unknown',
      fileExtension: '',
      sizeBytes: 0,
      normalizedFileName: normalizedName,
      contentHash: '',
      error: 'File is empty (0 bytes).',
    };
  }

  // 2. Reject executable signatures
  for (const exec of EXECUTABLE_MAGIC_BYTES) {
    let match = true;
    for (let i = 0; i < exec.bytes.length; i++) {
      if (buffer[i] !== exec.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      return {
        isValid: false,
        detectedMimeType: 'application/x-executable',
        fileExtension: '',
        sizeBytes,
        normalizedFileName: normalizedName,
        contentHash: '',
        error: `Hostile file signature detected: Executable binary (${exec.name}) is strictly rejected.`,
      };
    }
  }

  // 3. Compute SHA-256 hash
  const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');

  // 4. Validate supported signatures
  // PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  const isPdfExtension = normalizedName.toLowerCase().endsWith('.pdf');
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return {
      isValid: true,
      detectedMimeType: 'application/pdf',
      fileExtension: '.pdf',
      sizeBytes,
      normalizedFileName: isPdfExtension ? normalizedName : `${normalizedName}.pdf`,
      contentHash,
    };
  }

  if (isPdfExtension) {
    return {
      isValid: false,
      detectedMimeType: 'application/pdf',
      fileExtension: '.pdf',
      sizeBytes,
      normalizedFileName: normalizedName,
      contentHash,
      error: 'Invalid PDF signature: file does not start with valid %PDF- header.',
    };
  }

  // Check if buffer is valid UTF-8 text (Markdown or Plain Text)
  try {
    const textSample = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf8');
    // Check for null bytes which indicate non-text binary
    if (textSample.includes('\0')) {
      return {
        isValid: false,
        detectedMimeType: 'application/octet-stream',
        fileExtension: '',
        sizeBytes,
        normalizedFileName: normalizedName,
        contentHash,
        error:
          'Binary or unsupported file format. Only PDF, Plain Text (.txt), and Markdown (.md) are supported in MVP.',
      };
    }

    const lowerName = normalizedName.toLowerCase();
    const isMarkdown = lowerName.endsWith('.md') || lowerName.endsWith('.markdown');
    const isPlainText = lowerName.endsWith('.txt') || lowerName.endsWith('.text');

    if (!isMarkdown && !isPlainText) {
      const extMatch = /\.[a-z0-9]+$/i.exec(lowerName);
      const ext = extMatch ? extMatch[0] : 'unknown';
      return {
        isValid: false,
        detectedMimeType: 'unknown',
        fileExtension: ext,
        sizeBytes,
        normalizedFileName: normalizedName,
        contentHash,
        error: `Unsupported file format '${ext}'. Only PDF, Plain Text (.txt), and Markdown (.md) are supported in MVP.`,
      };
    }

    return {
      isValid: true,
      detectedMimeType: isMarkdown ? 'text/markdown' : 'text/plain',
      fileExtension: isMarkdown ? '.md' : '.txt',
      sizeBytes,
      normalizedFileName: normalizedName,
      contentHash,
    };
  } catch {
    return {
      isValid: false,
      detectedMimeType: 'application/octet-stream',
      fileExtension: '',
      sizeBytes,
      normalizedFileName: normalizedName,
      contentHash,
      error: 'Malformed file contents: UTF-8 encoding failed.',
    };
  }
}

/**
 * Asserts file bytes are valid; throws AppError if invalid.
 */
export function assertValidFileBytes(
  buffer: Buffer,
  declaredFileName: string,
): FileValidationResult {
  const result = validateFileBytes(buffer, declaredFileName);
  if (!result.isValid) {
    throw AppError.badRequest(result.error || 'Invalid file format or contents.');
  }
  return result;
}

export const validateFile = validateFileBytes;

/**
 * Validates batch upload counts and aggregate size before per-file processing.
 */
export function validateBatchUploadLimits(files: Array<{ size: number; name?: string }>): {
  isValid: boolean;
  error?: string;
  totalBytes: number;
} {
  if (!files || files.length === 0) {
    return {
      isValid: false,
      error: 'At least one file is required for batch upload.',
      totalBytes: 0,
    };
  }
  if (files.length > INGESTION_LIMITS.MAX_BATCH_FILE_COUNT) {
    return {
      isValid: false,
      error: `Batch file count (${files.length}) exceeds maximum allowed limit of ${INGESTION_LIMITS.MAX_BATCH_FILE_COUNT} files.`,
      totalBytes: 0,
    };
  }
  const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
  if (totalBytes > INGESTION_LIMITS.MAX_BATCH_TOTAL_BYTES) {
    const totalMb = (totalBytes / (1024 * 1024)).toFixed(1);
    const maxMb = (INGESTION_LIMITS.MAX_BATCH_TOTAL_BYTES / (1024 * 1024)).toFixed(0);
    return {
      isValid: false,
      error: `Aggregate batch size (${totalMb} MB) exceeds maximum allowed limit of ${maxMb} MB.`,
      totalBytes,
    };
  }
  return { isValid: true, totalBytes };
}
