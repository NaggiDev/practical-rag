import { LogContext, logger } from './logger';

// Re-export LogContext for convenience
export { LogContext };

// Error categories for structured logging and tracking
export enum ErrorCategory {
    DATA_SOURCE = 'data_source',
    PROCESSING = 'processing',
    SEARCH = 'search',
    API = 'api',
    AUTHENTICATION = 'authentication',
    VALIDATION = 'validation',
    NETWORK = 'network',
    SYSTEM = 'system'
}

// Base error class with structured logging support
export class BaseError extends Error {
    public readonly code: string;
    public readonly category: ErrorCategory;
    public readonly retryable: boolean;
    public readonly timestamp: Date;
    public readonly correlationId: string;
    public readonly context: LogContext;

    constructor(
        message: string,
        code: string,
        category: ErrorCategory,
        retryable: boolean = false,
        context: LogContext = {}
    ) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.category = category;
        this.retryable = retryable;
        this.timestamp = new Date();
        this.correlationId = logger.getCorrelationId();
        this.context = context;

        // Log the error with structured logging
        this.logError();
    }

    private logError(): void {
        logger.error(this.message, {
            errorCode: this.code,
            errorCategory: this.category,
            retryable: this.retryable,
            stackTrace: this.stack,
            ...this.context
        });
    }

    public toJSON(): object {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            category: this.category,
            retryable: this.retryable,
            timestamp: this.timestamp.toISOString(),
            correlationId: this.correlationId,
            context: this.context
        };
    }
}

// Data source related errors
export class DataSourceError extends BaseError {
    public readonly sourceId?: string;

    constructor(
        message: string,
        code: string,
        sourceId?: string,
        retryable: boolean = false,
        context: LogContext = {}
    ) {
        super(message, code, ErrorCategory.DATA_SOURCE, retryable, {
            ...context,
            sourceId
        });
        this.sourceId = sourceId;
    }
}

export class ConnectionError extends DataSourceError {
    constructor(message: string, sourceId?: string, context: LogContext = {}) {
        super(message, 'CONNECTION_ERROR', sourceId, true, {
            ...context,
            errorType: 'connection_failure'
        });
    }
}

export class AuthenticationError extends BaseError {
    constructor(message: string, sourceId?: string, context: LogContext = {}) {
        super(message, 'AUTHENTICATION_ERROR', ErrorCategory.AUTHENTICATION, false, {
            ...context,
            sourceId,
            errorType: 'authentication_failure'
        });
    }
}

export class ValidationError extends BaseError {
    public readonly field?: string;
    public readonly value?: any;

    constructor(message: string, field?: string, value?: any, context: LogContext = {}) {
        super(message, 'VALIDATION_ERROR', ErrorCategory.VALIDATION, false, {
            ...context,
            field,
            value: typeof value === 'object' ? JSON.stringify(value) : value,
            errorType: 'validation_failure'
        });
        this.field = field;
        this.value = value;
    }
}

export class TimeoutError extends BaseError {
    public readonly timeoutMs: number;
    public readonly operation: string;

    constructor(message: string, operation: string, timeoutMs: number, context: LogContext = {}) {
        super(message, 'TIMEOUT_ERROR', ErrorCategory.NETWORK, true, {
            ...context,
            operation,
            timeoutMs,
            errorType: 'timeout'
        });
        this.timeoutMs = timeoutMs;
        this.operation = operation;
    }
}

export class RateLimitError extends BaseError {
    public readonly retryAfter?: number;
    public readonly limit?: number;

    constructor(
        message: string,
        retryAfter?: number,
        limit?: number,
        context: LogContext = {}
    ) {
        super(message, 'RATE_LIMIT_ERROR', ErrorCategory.API, true, {
            ...context,
            retryAfter,
            limit,
            errorType: 'rate_limit_exceeded'
        });
        this.retryAfter = retryAfter;
        this.limit = limit;
    }
}

export class ParseError extends BaseError {
    public readonly sourceType: string;
    public readonly parsePosition?: number;

    constructor(
        message: string,
        sourceType: string,
        parsePosition?: number,
        context: LogContext = {}
    ) {
        super(message, 'PARSE_ERROR', ErrorCategory.PROCESSING, false, {
            ...context,
            sourceType,
            parsePosition,
            errorType: 'parse_failure'
        });
        this.sourceType = sourceType;
        this.parsePosition = parsePosition;
    }
}

// Search and processing errors
export class SearchError extends BaseError {
    public readonly queryId?: string;
    public readonly searchType: string;

    constructor(
        message: string,
        searchType: string,
        queryId?: string,
        context: LogContext = {}
    ) {
        super(message, 'SEARCH_ERROR', ErrorCategory.SEARCH, true, {
            ...context,
            queryId,
            searchType,
            errorType: 'search_failure'
        });
        this.queryId = queryId;
        this.searchType = searchType;
    }
}

export class EmbeddingError extends BaseError {
    public readonly modelName: string;
    public readonly textLength: number;

    constructor(
        message: string,
        modelName: string,
        textLength: number,
        context: LogContext = {}
    ) {
        super(message, 'EMBEDDING_ERROR', ErrorCategory.PROCESSING, true, {
            ...context,
            modelName,
            textLength,
            errorType: 'embedding_generation_failure'
        });
        this.modelName = modelName;
        this.textLength = textLength;
    }
}

export class IndexingError extends BaseError {
    public readonly documentId?: string;
    public readonly indexType: string;

    constructor(
        message: string,
        indexType: string,
        documentId?: string,
        context: LogContext = {}
    ) {
        super(message, 'INDEXING_ERROR', ErrorCategory.PROCESSING, true, {
            ...context,
            documentId,
            indexType,
            errorType: 'indexing_failure'
        });
        this.documentId = documentId;
        this.indexType = indexType;
    }
}

// System errors
export class SystemError extends BaseError {
    public readonly component: string;
    public readonly systemInfo?: object;

    constructor(
        message: string,
        component: string,
        systemInfo?: object,
        context: LogContext = {}
    ) {
        super(message, 'SYSTEM_ERROR', ErrorCategory.SYSTEM, false, {
            ...context,
            component,
            systemInfo,
            errorType: 'system_failure'
        });
        this.component = component;
        this.systemInfo = systemInfo;
    }
}

// Error handler utility functions
export class ErrorHandler {
    public static handleError(error: Error, operation: string, context: LogContext = {}): BaseError {
        // If it's already a BaseError, just return it
        if (error instanceof BaseError) {
            return error;
        }

        // Convert standard errors to BaseError with context
        const baseError = new SystemError(
            error.message,
            operation,
            {
                originalError: error.name,
                stack: error.stack
            },
            {
                ...context,
                operation,
                originalErrorName: error.name
            }
        );

        return baseError;
    }

    public static isRetryable(error: Error): boolean {
        if (error instanceof BaseError) {
            return error.retryable;
        }

        // Default retry logic for standard errors
        const retryableErrors = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND'
        ];

        return retryableErrors.some(code => error.message.includes(code));
    }

    public static getErrorCategory(error: Error): ErrorCategory {
        if (error instanceof BaseError) {
            return error.category;
        }

        // Categorize standard errors
        const message = error.message.toLowerCase();
        if (message.includes('timeout')) {
            return ErrorCategory.NETWORK;
        }
        if (message.includes('connection')) {
            return ErrorCategory.NETWORK;
        }
        if (message.includes('auth')) {
            return ErrorCategory.AUTHENTICATION;
        }
        if (message.includes('validation')) {
            return ErrorCategory.VALIDATION;
        }

        return ErrorCategory.SYSTEM;
    }

    public static createErrorResponse(error: Error, correlationId?: string): {
        error: {
            code: string;
            message: string;
            category: string;
            retryable: boolean;
            timestamp: string;
            correlationId: string;
            details?: object;
        };
    } {
        const baseError = error instanceof BaseError ? error : this.handleError(error, 'unknown');

        return {
            error: {
                code: baseError.code,
                message: baseError.message,
                category: baseError.category,
                retryable: baseError.retryable,
                timestamp: baseError.timestamp.toISOString(),
                correlationId: correlationId || baseError.correlationId,
                details: baseError.context
            }
        };
    }
}
export class ProcessingError extends BaseError {
    public override readonly code: string;

    constructor(
        message: string,
        code: string,
        context: LogContext = {}
    ) {
        super(message, 'PROCESSING_ERROR', ErrorCategory.PROCESSING, true, {
            ...context,
            code,
            errorType: 'processing_failure'
        });
        this.code = code;
    }
}