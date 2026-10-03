export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'INTERNAL_ERROR';

export interface ErrorResponseEnvelope {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: ErrorCode;
  instance?: string | undefined;
  invalidParams?: Array<{ name: string; reason: string }> | undefined;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly status: number;
  public readonly details?: unknown;

  constructor(code: ErrorCode, message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;

    if (status) {
      this.status = status;
    } else {
      switch (code) {
        case 'UNAUTHORIZED':
          this.status = 401;
          break;
        case 'FORBIDDEN':
          this.status = 403;
          break;
        case 'NOT_FOUND':
          this.status = 404;
          break;
        case 'BAD_REQUEST':
          this.status = 400;
          break;
        case 'CONFLICT':
          this.status = 409;
          break;
        case 'RATE_LIMITED':
          this.status = 429;
          break;
        case 'INTERNAL_ERROR':
        default:
          this.status = 500;
          break;
      }
    }
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHORIZED', message, 401);
  }

  static forbidden(message = 'You do not have permission to access this resource'): AppError {
    return new AppError('FORBIDDEN', message, 403);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError('NOT_FOUND', message, 404);
  }

  static badRequest(message = 'Invalid request payload', details?: unknown): AppError {
    return new AppError('BAD_REQUEST', message, 400, details);
  }

  static rateLimited(message = 'Too many requests. Please try again later.'): AppError {
    return new AppError('RATE_LIMITED', message, 429);
  }

  static internal(message = 'An unexpected server error occurred'): AppError {
    return new AppError('INTERNAL_ERROR', message, 500);
  }
}

export function formatErrorResponse(error: unknown, instancePath?: string): ErrorResponseEnvelope {
  if (error instanceof AppError) {
    return {
      type: `https://campusflow.internal/errors/${error.code.toLowerCase()}`,
      title: error.code,
      status: error.status,
      detail: error.message,
      code: error.code,
      instance: instancePath,
    };
  }

  const errMessage =
    process.env['NODE_ENV'] === 'production'
      ? 'An unexpected internal error occurred.'
      : error instanceof Error
        ? error.message
        : String(error);

  return {
    type: 'https://campusflow.internal/errors/internal_error',
    title: 'INTERNAL_ERROR',
    status: 500,
    detail: errMessage,
    code: 'INTERNAL_ERROR',
    instance: instancePath,
  };
}
