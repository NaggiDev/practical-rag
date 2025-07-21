import { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { ErrorResponse } from '../../models/response';
import { ApiRequest } from '../app';

export class RateLimitError extends Error {
    constructor(message: string = 'Rate limit exceeded') {
        super(message);
        this.name = 'RateLimitError';
    }
}

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
    windowMs: number;
    max: number;
    message: string;
    standardHeaders: boolean;
    legacyHeaders: boolean;
}

/**
 * Default rate limit configurations for different endpoints
 */
const rateLimitConfigs: Record<string, RateLimitConfig> = {
    default: {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: process.env.NODE_ENV === 'test' ? 10000 : 100, // Higher limit in test
        message: 'Too many requests from this IP, please try again later',
        standardHeaders: true,
        legacyHeaders: false
    },
    query: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: process.env.NODE_ENV === 'test' ? 10000 : 10, // Higher limit in test
        message: 'Too many query requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false
    },
    sources: {
        windowMs: 5 * 60 * 1000, // 5 minutes
        max: process.env.NODE_ENV === 'test' ? 10000 : 20, // Higher limit in test
        message: 'Too many source management requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false
    },
    health: {
        windowMs: 1 * 60 * 1000, // 1 minute
        max: process.env.NODE_ENV === 'test' ? 10000 : 60, // Higher limit in test
        message: 'Too many health check requests',
        standardHeaders: true,
        legacyHeaders: false
    }
};

/**
 * Create rate limiter with custom configuration
 */
function createRateLimiter(config: RateLimitConfig) {
    return rateLimit({
        windowMs: config.windowMs,
        max: config.max,
        standardHeaders: config.standardHeaders,
        legacyHeaders: config.legacyHeaders,
        keyGenerator: (req: Request) => {
            // Use user ID if authenticated, otherwise fall back to IP
            const apiReq = req as ApiRequest;
            return (apiReq as any).userId || req.ip || 'unknown';
        },
        handler: (req: any, res: Response) => {
            const error: ErrorResponse = {
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: config.message,
                    details: {
                        limit: config.max,
                        windowMs: config.windowMs,
                        retryAfter: Math.ceil(config.windowMs / 1000)
                    },
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            };

            res.status(429).json(error);
        },
        skip: (_req: Request) => {
            // Skip rate limiting in test environment, but still add headers for testing
            if (process.env.NODE_ENV === 'test') {
                return false; // Don't skip, but with very high limits
            }
            return false;
        }
    });
}

/**
 * General rate limiting middleware
 */
export const rateLimitMiddleware = createRateLimiter(rateLimitConfigs.default!);

/**
 * Query-specific rate limiting
 */
export const queryRateLimitMiddleware = createRateLimiter(rateLimitConfigs.query!);

/**
 * Source management rate limiting
 */
export const sourcesRateLimitMiddleware = createRateLimiter(rateLimitConfigs.sources!);

/**
 * Health check rate limiting
 */
export const healthRateLimitMiddleware = createRateLimiter(rateLimitConfigs.health!);

/**
 * Premium user rate limiting (higher limits)
 */
export const premiumRateLimitMiddleware = createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 10x higher limit for premium users
    message: 'Premium rate limit exceeded',
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Adaptive rate limiting based on user role
 */
export const adaptiveRateLimitMiddleware = (req: ApiRequest, res: Response, next: NextFunction) => {
    const userRole = (req as any).userRole;

    // Apply different rate limits based on user role
    let middleware;

    switch (userRole) {
        case 'admin':
            // Admins get higher limits
            middleware = createRateLimiter({
                windowMs: 15 * 60 * 1000,
                max: 500,
                message: 'Admin rate limit exceeded',
                standardHeaders: true,
                legacyHeaders: false
            });
            break;
        case 'premium':
            middleware = premiumRateLimitMiddleware;
            break;
        default:
            middleware = rateLimitMiddleware;
    }

    middleware(req, res, next);
};

/**
 * Burst rate limiting for expensive operations
 */
export const burstRateLimitMiddleware = createRateLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 5, // Very restrictive for expensive operations
    message: 'Too many expensive operations, please wait before trying again',
    standardHeaders: true,
    legacyHeaders: false
});

/**
 * Rate limiting for file uploads
 */
export const uploadRateLimitMiddleware = createRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes
    max: 10, // 10 uploads per 10 minutes
    message: 'Too many file uploads, please try again later',
    standardHeaders: true,
    legacyHeaders: false
});
