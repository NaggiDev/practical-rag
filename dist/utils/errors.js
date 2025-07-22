"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessingError = exports.ErrorHandler = exports.SystemError = exports.IndexingError = exports.EmbeddingError = exports.SearchError = exports.ParseError = exports.RateLimitError = exports.TimeoutError = exports.ValidationError = exports.AuthenticationError = exports.ConnectionError = exports.DataSourceError = exports.BaseError = exports.ErrorCategory = void 0;
const logger_1 = require("./logger");
var ErrorCategory;
(function (ErrorCategory) {
    ErrorCategory["DATA_SOURCE"] = "data_source";
    ErrorCategory["PROCESSING"] = "processing";
    ErrorCategory["SEARCH"] = "search";
    ErrorCategory["API"] = "api";
    ErrorCategory["AUTHENTICATION"] = "authentication";
    ErrorCategory["VALIDATION"] = "validation";
    ErrorCategory["NETWORK"] = "network";
    ErrorCategory["SYSTEM"] = "system";
})(ErrorCategory || (exports.ErrorCategory = ErrorCategory = {}));
class BaseError extends Error {
    constructor(message, code, category, retryable = false, context = {}) {
        super(message);
        this.name = this.constructor.name;
        this.code = code;
        this.category = category;
        this.retryable = retryable;
        this.timestamp = new Date();
        this.correlationId = logger_1.logger.getCorrelationId();
        this.context = context;
        this.logError();
    }
    logError() {
        logger_1.logger.error(this.message, {
            errorCode: this.code,
            errorCategory: this.category,
            retryable: this.retryable,
            stackTrace: this.stack,
            ...this.context
        });
    }
    toJSON() {
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
exports.BaseError = BaseError;
class DataSourceError extends BaseError {
    constructor(message, code, sourceId, retryable = false, context = {}) {
        super(message, code, ErrorCategory.DATA_SOURCE, retryable, {
            ...context,
            sourceId
        });
        this.sourceId = sourceId;
    }
}
exports.DataSourceError = DataSourceError;
class ConnectionError extends DataSourceError {
    constructor(message, sourceId, context = {}) {
        super(message, 'CONNECTION_ERROR', sourceId, true, {
            ...context,
            errorType: 'connection_failure'
        });
    }
}
exports.ConnectionError = ConnectionError;
class AuthenticationError extends BaseError {
    constructor(message, sourceId, context = {}) {
        super(message, 'AUTHENTICATION_ERROR', ErrorCategory.AUTHENTICATION, false, {
            ...context,
            sourceId,
            errorType: 'authentication_failure'
        });
    }
}
exports.AuthenticationError = AuthenticationError;
class ValidationError extends BaseError {
    constructor(message, field, value, context = {}) {
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
exports.ValidationError = ValidationError;
class TimeoutError extends BaseError {
    constructor(message, operation, timeoutMs, context = {}) {
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
exports.TimeoutError = TimeoutError;
class RateLimitError extends BaseError {
    constructor(message, retryAfter, limit, context = {}) {
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
exports.RateLimitError = RateLimitError;
class ParseError extends BaseError {
    constructor(message, sourceType, parsePosition, context = {}) {
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
exports.ParseError = ParseError;
class SearchError extends BaseError {
    constructor(message, searchType, queryId, context = {}) {
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
exports.SearchError = SearchError;
class EmbeddingError extends BaseError {
    constructor(message, modelName, textLength, context = {}) {
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
exports.EmbeddingError = EmbeddingError;
class IndexingError extends BaseError {
    constructor(message, indexType, documentId, context = {}) {
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
exports.IndexingError = IndexingError;
class SystemError extends BaseError {
    constructor(message, component, systemInfo, context = {}) {
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
exports.SystemError = SystemError;
class ErrorHandler {
    static handleError(error, operation, context = {}) {
        if (error instanceof BaseError) {
            return error;
        }
        const baseError = new SystemError(error.message, operation, {
            originalError: error.name,
            stack: error.stack
        }, {
            ...context,
            operation,
            originalErrorName: error.name
        });
        return baseError;
    }
    static isRetryable(error) {
        if (error instanceof BaseError) {
            return error.retryable;
        }
        const retryableErrors = [
            'ECONNRESET',
            'ECONNREFUSED',
            'ETIMEDOUT',
            'ENOTFOUND'
        ];
        return retryableErrors.some(code => error.message.includes(code));
    }
    static getErrorCategory(error) {
        if (error instanceof BaseError) {
            return error.category;
        }
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
    static createErrorResponse(error, correlationId) {
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
exports.ErrorHandler = ErrorHandler;
class ProcessingError extends BaseError {
    constructor(message, code, context = {}) {
        super(message, 'PROCESSING_ERROR', ErrorCategory.PROCESSING, true, {
            ...context,
            code,
            errorType: 'processing_failure'
        });
        this.code = code;
    }
}
exports.ProcessingError = ProcessingError;
//# sourceMappingURL=errors.js.map