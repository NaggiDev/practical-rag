"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequestSize = exports.validateContentType = exports.sanitizeRequest = exports.commonSchemas = exports.validateWithJoi = exports.validationErrorHandler = exports.ValidationError = void 0;
const express_validator_1 = require("express-validator");
const joi_1 = __importDefault(require("joi"));
class ValidationError extends Error {
    constructor(message, details = []) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}
exports.ValidationError = ValidationError;
const validationErrorHandler = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const errorDetails = errors.array().map(error => ({
            field: error.type === 'field' ? error.path : error.type,
            message: error.msg,
            value: error.value,
            location: error.location
        }));
        const errorResponse = {
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Request validation failed',
                details: {
                    errors: errorDetails
                },
                timestamp: new Date(),
                correlationId: req.correlationId
            }
        };
        return res.status(400).json(errorResponse);
    }
    next();
};
exports.validationErrorHandler = validationErrorHandler;
const validateWithJoi = (schema, target = 'body') => {
    return (req, res, next) => {
        const apiReq = req;
        const dataToValidate = req[target];
        const { error, value } = schema.validate(dataToValidate, {
            abortEarly: false,
            stripUnknown: true,
            allowUnknown: false
        });
        if (error) {
            const errorDetails = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value,
                type: detail.type
            }));
            const errorResponse = {
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `${target} validation failed`,
                    details: {
                        errors: errorDetails
                    },
                    timestamp: new Date(),
                    correlationId: apiReq.correlationId
                }
            };
            return res.status(400).json(errorResponse);
        }
        req[target] = value;
        next();
    };
};
exports.validateWithJoi = validateWithJoi;
exports.commonSchemas = {
    uuid: joi_1.default.string().uuid().required(),
    pagination: joi_1.default.object({
        page: joi_1.default.number().integer().min(1).default(1),
        limit: joi_1.default.number().integer().min(1).max(100).default(20),
        sort: joi_1.default.string().valid('asc', 'desc').default('desc'),
        sortBy: joi_1.default.string().optional()
    }),
    queryRequest: joi_1.default.object({
        text: joi_1.default.string().required().min(1).max(10000).trim(),
        context: joi_1.default.object().optional(),
        filters: joi_1.default.array().items(joi_1.default.object({
            field: joi_1.default.string().required().min(1).max(100),
            operator: joi_1.default.string().valid('eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'contains').required(),
            value: joi_1.default.any().required()
        })).optional(),
        userId: joi_1.default.string().optional().min(1).max(100)
    }),
    dataSourceRequest: joi_1.default.object({
        name: joi_1.default.string().required().min(1).max(100).trim(),
        type: joi_1.default.string().valid('file', 'database', 'api').required(),
        config: joi_1.default.object().required()
    }),
    healthParams: joi_1.default.object({
        detailed: joi_1.default.boolean().default(false),
        includeMetrics: joi_1.default.boolean().default(false)
    })
};
const sanitizeRequest = (req, _res, next) => {
    if (req.body) {
        req.body = sanitizeObject(req.body);
    }
    if (req.query) {
        req.query = sanitizeObject(req.query);
    }
    if (req.params) {
        req.params = sanitizeObject(req.params);
    }
    next();
};
exports.sanitizeRequest = sanitizeRequest;
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return sanitizeValue(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = sanitizeValue(key);
        sanitized[sanitizedKey] = sanitizeObject(value);
    }
    return sanitized;
}
function sanitizeValue(value) {
    if (typeof value === 'string') {
        return value
            .trim()
            .replace(/[<>]/g, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '');
    }
    return value;
}
const validateContentType = (allowedTypes = ['application/json']) => {
    return (req, res, next) => {
        const apiReq = req;
        const contentType = req.headers['content-type'];
        if (req.method === 'GET') {
            return next();
        }
        if (!contentType) {
            const errorResponse = {
                error: {
                    code: 'MISSING_CONTENT_TYPE',
                    message: 'Content-Type header is required',
                    timestamp: new Date(),
                    correlationId: apiReq.correlationId
                }
            };
            return res.status(400).json(errorResponse);
        }
        const isValidType = allowedTypes.some(type => contentType.toLowerCase().includes(type.toLowerCase()));
        if (!isValidType) {
            const errorResponse = {
                error: {
                    code: 'INVALID_CONTENT_TYPE',
                    message: `Content-Type must be one of: ${allowedTypes.join(', ')}`,
                    details: {
                        received: contentType,
                        allowed: allowedTypes
                    },
                    timestamp: new Date(),
                    correlationId: apiReq.correlationId
                }
            };
            return res.status(415).json(errorResponse);
        }
        next();
    };
};
exports.validateContentType = validateContentType;
const validateRequestSize = (maxSizeBytes = 10 * 1024 * 1024) => {
    return (req, res, next) => {
        const apiReq = req;
        const contentLength = parseInt(req.headers['content-length'] || '0');
        if (contentLength > maxSizeBytes) {
            const errorResponse = {
                error: {
                    code: 'REQUEST_TOO_LARGE',
                    message: `Request size exceeds maximum allowed size of ${maxSizeBytes} bytes`,
                    details: {
                        maxSize: maxSizeBytes,
                        receivedSize: contentLength
                    },
                    timestamp: new Date(),
                    correlationId: apiReq.correlationId
                }
            };
            return res.status(413).json(errorResponse);
        }
        next();
    };
};
exports.validateRequestSize = validateRequestSize;
//# sourceMappingURL=validation.js.map