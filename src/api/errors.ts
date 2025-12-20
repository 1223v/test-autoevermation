import { ApiErrorCode, ApiErrorInfo } from './types';

/**
 * Base class for API-related errors
 */
export class ApiError extends Error {
    public readonly code: string;
    public readonly requestId?: string;
    public readonly details?: Record<string, unknown>;

    constructor(message: string, code: string = 'UNKNOWN_ERROR', requestId?: string, details?: Record<string, unknown>) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.requestId = requestId;
        this.details = details;
    }

    public static fromApiError(error: ApiErrorInfo): ApiError {
        return new ApiError(
            error.message,
            error.code,
            error.requestId,
            error.details
        );
    }
}

/**
 * Error thrown when API key is missing or invalid
 */
export class ApiKeyError extends ApiError {
    constructor(message: string = 'API key is missing or invalid') {
        super(message, ApiErrorCode.INVALID_API_KEY);
        this.name = 'ApiKeyError';
    }
}

/**
 * Error thrown when server connection fails
 */
export class ServerConnectionError extends ApiError {
    public readonly originalError?: Error;

    constructor(message: string = 'Unable to connect to API server', originalError?: Error) {
        super(message, 'CONNECTION_ERROR');
        this.name = 'ServerConnectionError';
        this.originalError = originalError;
    }
}

/**
 * Error thrown when test generation fails
 */
export class TestGenerationError extends ApiError {
    constructor(message: string, requestId?: string, details?: Record<string, unknown>) {
        super(message, ApiErrorCode.GENERATION_FAILED, requestId, details);
        this.name = 'TestGenerationError';
    }
}

/**
 * Error thrown when Java syntax is invalid
 */
export class JavaSyntaxError extends ApiError {
    public readonly line?: number;
    public readonly column?: number;

    constructor(message: string, line?: number, column?: number) {
        super(message, ApiErrorCode.INVALID_JAVA_SYNTAX, undefined, { line, column });
        this.name = 'JavaSyntaxError';
        this.line = line;
        this.column = column;
    }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends ApiError {
    public readonly retryAfter?: number;

    constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
        super(message, ApiErrorCode.RATE_LIMIT_EXCEEDED);
        this.name = 'RateLimitError';
        this.retryAfter = retryAfter;
    }
}

/**
 * Error thrown when request times out
 */
export class TimeoutError extends ApiError {
    constructor(message: string = 'Request timed out') {
        super(message, 'TIMEOUT');
        this.name = 'TimeoutError';
    }
}

/**
 * Helper function to get user-friendly error message
 */
export function getUserFriendlyErrorMessage(error: unknown): string {
    if (error instanceof ApiKeyError) {
        return 'API key is invalid or not configured. Please check your settings.';
    }

    if (error instanceof ServerConnectionError) {
        return 'Cannot connect to the test generation server. Please check the API URL and your network connection.';
    }

    if (error instanceof RateLimitError) {
        const retryMsg = error.retryAfter
            ? ` Please try again in ${error.retryAfter} seconds.`
            : ' Please try again later.';
        return `Too many requests.${retryMsg}`;
    }

    if (error instanceof JavaSyntaxError) {
        const locationMsg = error.line ? ` (line ${error.line})` : '';
        return `Java syntax error${locationMsg}: ${error.message}`;
    }

    if (error instanceof TimeoutError) {
        return 'Request timed out. The server might be busy. Please try again.';
    }

    if (error instanceof TestGenerationError) {
        return `Test generation failed: ${error.message}`;
    }

    if (error instanceof ApiError) {
        return error.message;
    }

    if (error instanceof Error) {
        return error.message;
    }

    return 'An unexpected error occurred';
}
