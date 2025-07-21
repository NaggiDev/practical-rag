import { NextFunction, Response } from 'express';
import { ApiRequest } from '../app';
export interface AuthenticatedRequest extends ApiRequest {
    userId: string;
    userRole?: string;
}
export declare class UnauthorizedError extends Error {
    constructor(message?: string);
}
export declare class ForbiddenError extends Error {
    constructor(message?: string);
}
export declare const authMiddleware: (req: ApiRequest, _res: Response, next: NextFunction) => Promise<void>;
export declare const requireRole: (requiredRole: string) => (req: AuthenticatedRequest, _res: Response, next: NextFunction) => void;
export declare const optionalAuthMiddleware: (req: ApiRequest, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=auth.d.ts.map