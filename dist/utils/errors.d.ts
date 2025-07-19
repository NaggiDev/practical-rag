export declare class DataSourceError extends Error {
    readonly code: string;
    readonly sourceId?: string;
    readonly retryable: boolean;
    readonly timestamp: Date;
    constructor(message: string, code: string, sourceId?: string, retryable?: boolean);
}
export declare class ConnectionError extends DataSourceError {
    constructor(message: string, sourceId?: string);
}
export declare class AuthenticationError extends DataSourceError {
    constructor(message: string, sourceId?: string);
}
export declare class ValidationError extends DataSourceError {
    constructor(message: string, sourceId?: string);
}
export declare class TimeoutError extends DataSourceError {
    constructor(message: string, sourceId?: string);
}
export declare class RateLimitError extends DataSourceError {
    constructor(message: string, sourceId?: string, retryAfter?: number);
}
export declare class ParseError extends DataSourceError {
    constructor(message: string, sourceId?: string);
}
//# sourceMappingURL=errors.d.ts.map