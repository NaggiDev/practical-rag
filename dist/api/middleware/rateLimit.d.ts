import { NextFunction, Response } from 'express';
import { ApiRequest } from '../app';
export declare class RateLimitError extends Error {
    constructor(message?: string);
}
export declare const rateLimitMiddleware: import("express-rate-limit").RateLimitRequestHandler;
export declare const queryRateLimitMiddleware: import("express-rate-limit").RateLimitRequestHandler;
export declare const sourcesRateLimitMiddleware: import("express-rate-limit").RateLimitRequestHandler;
export declare const healthRateLimitMiddleware: import("express-rate-limit").RateLimitRequestHandler;
export declare const premiumRateLimitMiddleware: import("express-rate-limit").RateLimitRequestHandler;
export declare const adaptiveRateLimitMiddleware: (req: ApiRequest, res: Response, next: NextFunction) => void;
export declare const burstRateLimitMiddleware: import("express-rate-limit").RateLimitRequestHandler;
export declare const uploadRateLimitMiddleware: import("express-rate-limit").RateLimitRequestHandler;
//# sourceMappingURL=rateLimit.d.ts.map