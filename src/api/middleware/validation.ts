import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';
import Joi from 'joi';
import { ErrorResponse } from '../../models/response';
import { ApiRequest } from '../app';

export class ValidationError extends Error {
    public details: any[];

    constructor(message: string, details: any[] = []) {
        super(message);
        this.name = 'ValidationError';
        this.details = details;
    }
}

/**
 * Express-validator error handler middleware
 */
export const validationErrorHandler = (
    req: ApiRequest,
    res: Response,
    next: NextFunction
): any => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
        const errorDetails = errors.array().map(error => ({
            field: error.type === 'field' ? (error as any).path : error.type,
            message: error.msg,
            value: (error as any).value,
            location: (error as any).location
        }));

        const errorResponse: ErrorResponse = {
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

/**
 * Joi validation middleware factory
 */
export const validateWithJoi = (schema: Joi.ObjectSchema, target: 'body' | 'query' | 'params' = 'body') => {
    return (req: Request, res: Response, next: NextFunction): any => {
        const apiReq = req as ApiRequest;
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

            const errorResponse: ErrorResponse = {
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

        // Replace the original data with validated and sanitized data
        (req as any)[target] = value;
        next();
    };
};

/**
 * Common validation schemas
 */
export const commonSchemas = {
    // UUID validation
    uuid: Joi.string().uuid().required(),

    // Pagination parameters
    pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(20),
        sort: Joi.string().valid('asc', 'desc').default('desc'),
        sortBy: Joi.string().optional()
    }),

    // Query parameters
    queryRequest: Joi.object({
        text: Joi.string().required().min(1).max(10000).trim(),
        context: Joi.object().optional(),
        filters: Joi.array().items(Joi.object({
            field: Joi.string().required().min(1).max(100),
            operator: Joi.string().valid('eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'in', 'contains').required(),
            value: Joi.any().required()
        })).optional(),
        userId: Joi.string().optional().min(1).max(100)
    }),

    // Data source configuration
    dataSourceRequest: Joi.object({
        name: Joi.string().required().min(1).max(100).trim(),
        type: Joi.string().valid('file', 'database', 'api').required(),
        config: Joi.object().required() // Specific validation handled by DataSourceConfigModel
    }),

    // Health check parameters
    healthParams: Joi.object({
        detailed: Joi.boolean().default(false),
        includeMetrics: Joi.boolean().default(false)
    })
};

/**
 * Request sanitization middleware
 */
export const sanitizeRequest = (req: Request, _res: Response, next: NextFunction): void => {
    // Sanitize common fields
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

/**
 * Recursively sanitize object properties
 */
function sanitizeObject(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
        return sanitizeValue(obj);
    }

    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
        const sanitizedKey = sanitizeValue(key);
        sanitized[sanitizedKey] = sanitizeObject(value);
    }

    return sanitized;
}

/**
 * Sanitize individual values
 */
function sanitizeValue(value: any): any {
    if (typeof value === 'string') {
        return value
            .trim()
            .replace(/[<>]/g, '') // Remove potential HTML tags
            .replace(/javascript:/gi, '') // Remove javascript: protocol
            .replace(/on\w+=/gi, ''); // Remove event handlers
    }

    return value;
}

/**
 * Content-Type validation middleware
 */
export const validateContentType = (allowedTypes: string[] = ['application/json']) => {
    return (req: Request, res: Response, next: NextFunction): any => {
        const apiReq = req as ApiRequest;
        const contentType = req.headers['content-type'];

        // Skip validation for GET requests
        if (req.method === 'GET') {
            return next();
        }

        if (!contentType) {
            const errorResponse: ErrorResponse = {
                error: {
                    code: 'MISSING_CONTENT_TYPE',
                    message: 'Content-Type header is required',
                    timestamp: new Date(),
                    correlationId: apiReq.correlationId
                }
            };
            return res.status(400).json(errorResponse);
        }

        const isValidType = allowedTypes.some(type =>
            contentType.toLowerCase().includes(type.toLowerCase())
        );

        if (!isValidType) {
            const errorResponse: ErrorResponse = {
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

/**
 * Request size validation middleware
 */
export const validateRequestSize = (maxSizeBytes: number = 10 * 1024 * 1024) => {
    return (req: Request, res: Response, next: NextFunction): any => {
        const apiReq = req as ApiRequest;
        const contentLength = parseInt(req.headers['content-length'] || '0');

        if (contentLength > maxSizeBytes) {
            const errorResponse: ErrorResponse = {
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
