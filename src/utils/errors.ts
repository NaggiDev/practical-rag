// Error handling utility

export class DataSourceError extends Error {
    public readonly code: string;
    public readonly sourceId?: string;
    public readonly retryable: boolean;
    public readonly timestamp: Date;

    constructor(
        message: string,
        code: string,
        sourceId?: string,
        retryable: boolean = false
    ) {
        super(message);
        this.name = 'DataSourceError';
        this.code = code;
        this.sourceId = sourceId;
        this.retryable = retryable;
        this.timestamp = new Date();
    }
}

export class ConnectionError extends DataSourceError {
    constructor(message: string, sourceId?: string) {
        super(message, 'CONNECTION_ERROR', sourceId, true);
        this.name = 'ConnectionError';
    }
}

export class AuthenticationError extends DataSourceError {
    constructor(message: string, sourceId?: string) {
        super(message, 'AUTHENTICATION_ERROR', sourceId, false);
        this.name = 'AuthenticationError';
    }
}

export class ValidationError extends DataSourceError {
    constructor(message: string, sourceId?: string) {
        super(message, 'VALIDATION_ERROR', sourceId, false);
        this.name = 'ValidationError';
    }
}

export class TimeoutError extends DataSourceError {
    constructor(message: string, sourceId?: string) {
        super(message, 'TIMEOUT_ERROR', sourceId, true);
        this.name = 'TimeoutError';
    }
}

export class RateLimitError extends DataSourceError {
    constructor(message: string, sourceId?: string, retryAfter?: number) {
        super(message, 'RATE_LIMIT_ERROR', sourceId, true);
        this.name = 'RateLimitError';
        if (retryAfter) {
            (this as any).retryAfter = retryAfter;
        }
    }
}

export class ParseError extends DataSourceError {
    constructor(message: string, sourceId?: string) {
        super(message, 'PARSE_ERROR', sourceId, false);
        this.name = 'ParseError';
    }
}
