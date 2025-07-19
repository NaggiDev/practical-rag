"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ParseError = exports.RateLimitError = exports.TimeoutError = exports.ValidationError = exports.AuthenticationError = exports.ConnectionError = exports.DataSourceError = void 0;
class DataSourceError extends Error {
    constructor(message, code, sourceId, retryable = false) {
        super(message);
        this.name = 'DataSourceError';
        this.code = code;
        this.sourceId = sourceId;
        this.retryable = retryable;
        this.timestamp = new Date();
    }
}
exports.DataSourceError = DataSourceError;
class ConnectionError extends DataSourceError {
    constructor(message, sourceId) {
        super(message, 'CONNECTION_ERROR', sourceId, true);
        this.name = 'ConnectionError';
    }
}
exports.ConnectionError = ConnectionError;
class AuthenticationError extends DataSourceError {
    constructor(message, sourceId) {
        super(message, 'AUTHENTICATION_ERROR', sourceId, false);
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class ValidationError extends DataSourceError {
    constructor(message, sourceId) {
        super(message, 'VALIDATION_ERROR', sourceId, false);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class TimeoutError extends DataSourceError {
    constructor(message, sourceId) {
        super(message, 'TIMEOUT_ERROR', sourceId, true);
        this.name = 'TimeoutError';
    }
}
exports.TimeoutError = TimeoutError;
class RateLimitError extends DataSourceError {
    constructor(message, sourceId, retryAfter) {
        super(message, 'RATE_LIMIT_ERROR', sourceId, true);
        this.name = 'RateLimitError';
        if (retryAfter) {
            this.retryAfter = retryAfter;
        }
    }
}
exports.RateLimitError = RateLimitError;
class ParseError extends DataSourceError {
    constructor(message, sourceId) {
        super(message, 'PARSE_ERROR', sourceId, false);
        this.name = 'ParseError';
    }
}
exports.ParseError = ParseError;
//# sourceMappingURL=errors.js.map