"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadRateLimitMiddleware = exports.burstRateLimitMiddleware = exports.adaptiveRateLimitMiddleware = exports.premiumRateLimitMiddleware = exports.healthRateLimitMiddleware = exports.sourcesRateLimitMiddleware = exports.queryRateLimitMiddleware = exports.rateLimitMiddleware = exports.RateLimitError = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
class RateLimitError extends Error {
    constructor(message = 'Rate limit exceeded') {
        super(message);
        this.name = 'RateLimitError';
    }
}
exports.RateLimitError = RateLimitError;
const rateLimitConfigs = {
    default: {
        windowMs: 15 * 60 * 1000,
        max: process.env.NODE_ENV === 'test' ? 10000 : 100,
        message: 'Too many requests from this IP, please try again later',
        standardHeaders: true,
        legacyHeaders: false
    },
    query: {
        windowMs: 1 * 60 * 1000,
        max: process.env.NODE_ENV === 'test' ? 10000 : 10,
        message: 'Too many query requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false
    },
    sources: {
        windowMs: 5 * 60 * 1000,
        max: process.env.NODE_ENV === 'test' ? 10000 : 20,
        message: 'Too many source management requests, please try again later',
        standardHeaders: true,
        legacyHeaders: false
    },
    health: {
        windowMs: 1 * 60 * 1000,
        max: process.env.NODE_ENV === 'test' ? 10000 : 60,
        message: 'Too many health check requests',
        standardHeaders: true,
        legacyHeaders: false
    }
};
function createRateLimiter(config) {
    return (0, express_rate_limit_1.default)({
        windowMs: config.windowMs,
        max: config.max,
        standardHeaders: config.standardHeaders,
        legacyHeaders: config.legacyHeaders,
        keyGenerator: (req) => {
            const apiReq = req;
            return apiReq.userId || req.ip || 'unknown';
        },
        handler: (req, res) => {
            const error = {
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
        skip: (_req) => {
            if (process.env.NODE_ENV === 'test') {
                return false;
            }
            return false;
        }
    });
}
exports.rateLimitMiddleware = createRateLimiter(rateLimitConfigs.default);
exports.queryRateLimitMiddleware = createRateLimiter(rateLimitConfigs.query);
exports.sourcesRateLimitMiddleware = createRateLimiter(rateLimitConfigs.sources);
exports.healthRateLimitMiddleware = createRateLimiter(rateLimitConfigs.health);
exports.premiumRateLimitMiddleware = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: 'Premium rate limit exceeded',
    standardHeaders: true,
    legacyHeaders: false
});
const adaptiveRateLimitMiddleware = (req, res, next) => {
    const userRole = req.userRole;
    let middleware;
    switch (userRole) {
        case 'admin':
            middleware = createRateLimiter({
                windowMs: 15 * 60 * 1000,
                max: 500,
                message: 'Admin rate limit exceeded',
                standardHeaders: true,
                legacyHeaders: false
            });
            break;
        case 'premium':
            middleware = exports.premiumRateLimitMiddleware;
            break;
        default:
            middleware = exports.rateLimitMiddleware;
    }
    middleware(req, res, next);
};
exports.adaptiveRateLimitMiddleware = adaptiveRateLimitMiddleware;
exports.burstRateLimitMiddleware = createRateLimiter({
    windowMs: 1 * 60 * 1000,
    max: 5,
    message: 'Too many expensive operations, please wait before trying again',
    standardHeaders: true,
    legacyHeaders: false
});
exports.uploadRateLimitMiddleware = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: 'Too many file uploads, please try again later',
    standardHeaders: true,
    legacyHeaders: false
});
//# sourceMappingURL=rateLimit.js.map