import { LogContext } from './logger';
export { LogContext };
export declare enum ErrorCategory {
    DATA_SOURCE = "data_source",
    PROCESSING = "processing",
    SEARCH = "search",
    API = "api",
    AUTHENTICATION = "authentication",
    VALIDATION = "validation",
    NETWORK = "network",
    SYSTEM = "system"
}
export declare class BaseError extends Error {
    readonly code: string;
    readonly category: ErrorCategory;
    readonly retryable: boolean;
    readonly timestamp: Date;
    readonly correlationId: string;
    readonly context: LogContext;
    constructor(message: string, code: string, category: ErrorCategory, retryable?: boolean, context?: LogContext);
    private logError;
    toJSON(): object;
}
export declare class DataSourceError extends BaseError {
    readonly sourceId?: string;
    constructor(message: string, code: string, sourceId?: string, retryable?: boolean, context?: LogContext);
}
export declare class ConnectionError extends DataSourceError {
    constructor(message: string, sourceId?: string, context?: LogContext);
}
export declare class AuthenticationError extends BaseError {
    constructor(message: string, sourceId?: string, context?: LogContext);
}
export declare class ValidationError extends BaseError {
    readonly field?: string;
    readonly value?: any;
    constructor(message: string, field?: string, value?: any, context?: LogContext);
}
export declare class TimeoutError extends BaseError {
    readonly timeoutMs: number;
    readonly operation: string;
    constructor(message: string, operation: string, timeoutMs: number, context?: LogContext);
}
export declare class RateLimitError extends BaseError {
    readonly retryAfter?: number;
    readonly limit?: number;
    constructor(message: string, retryAfter?: number, limit?: number, context?: LogContext);
}
export declare class ParseError extends BaseError {
    readonly sourceType: string;
    readonly parsePosition?: number;
    constructor(message: string, sourceType: string, parsePosition?: number, context?: LogContext);
}
export declare class SearchError extends BaseError {
    readonly queryId?: string;
    readonly searchType: string;
    constructor(message: string, searchType: string, queryId?: string, context?: LogContext);
}
export declare class EmbeddingError extends BaseError {
    readonly modelName: string;
    readonly textLength: number;
    constructor(message: string, modelName: string, textLength: number, context?: LogContext);
}
export declare class IndexingError extends BaseError {
    readonly documentId?: string;
    readonly indexType: string;
    constructor(message: string, indexType: string, documentId?: string, context?: LogContext);
}
export declare class SystemError extends BaseError {
    readonly component: string;
    readonly systemInfo?: object;
    constructor(message: string, component: string, systemInfo?: object, context?: LogContext);
}
export declare class ErrorHandler {
    static handleError(error: Error, operation: string, context?: LogContext): BaseError;
    static isRetryable(error: Error): boolean;
    static getErrorCategory(error: Error): ErrorCategory;
    static createErrorResponse(error: Error, correlationId?: string): {
        error: {
            code: string;
            message: string;
            category: string;
            retryable: boolean;
            timestamp: string;
            correlationId: string;
            details?: object;
        };
    };
}
export declare class ProcessingError extends BaseError {
    readonly code: string;
    constructor(message: string, code: string, context?: LogContext);
}
//# sourceMappingURL=errors.d.ts.map