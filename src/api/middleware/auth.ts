import { NextFunction, Response } from 'express';
import { ApiRequest } from '../app';

export interface AuthenticatedRequest extends ApiRequest {
    userId: string;
    userRole?: string;
}

export class UnauthorizedError extends Error {
    constructor(message: string = 'Authentication required') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}

export class ForbiddenError extends Error {
    constructor(message: string = 'Access denied') {
        super(message);
        this.name = 'ForbiddenError';
    }
}

/**
 * Authentication middleware that validates API keys or JWT tokens
 * Supports multiple authentication methods:
 * 1. API Key in Authorization header: "Bearer <api-key>"
 * 2. API Key in X-API-Key header
 * 3. JWT Token in Authorization header: "Bearer <jwt-token>"
 */
export const authMiddleware = async (
    req: ApiRequest,
    _res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers['x-api-key'] as string;

        // Skip authentication in development/test mode if configured
        if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && process.env.SKIP_AUTH === 'true') {
            (req as AuthenticatedRequest).userId = 'dev-user';
            (req as AuthenticatedRequest).userRole = 'admin';
            return next();
        }

        let token: string | undefined;
        let authMethod: 'api-key' | 'jwt' | undefined;

        // Extract token from Authorization header
        if (authHeader) {
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                token = parts[1];
                // Determine if it's an API key or JWT based on format
                authMethod = token && token.includes('.') ? 'jwt' : 'api-key';
            }
        }

        // Extract API key from X-API-Key header
        if (!token && apiKeyHeader) {
            token = apiKeyHeader;
            authMethod = 'api-key';
        }

        if (!token) {
            throw new UnauthorizedError('No authentication token provided');
        }

        // Validate token based on method
        let userId: string;
        let userRole: string = 'user';

        if (authMethod === 'api-key') {
            const result = await validateApiKey(token);
            userId = result.userId;
            userRole = result.role;
        } else if (authMethod === 'jwt') {
            const result = await validateJwtToken(token);
            userId = result.userId;
            userRole = result.role;
        } else {
            throw new UnauthorizedError('Invalid authentication method');
        }

        // Add user information to request
        (req as AuthenticatedRequest).userId = userId;
        (req as AuthenticatedRequest).userRole = userRole;

        next();
    } catch (error) {
        next(error);
    }
};

/**
 * Role-based authorization middleware
 */
export const requireRole = (requiredRole: string) => {
    return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
        if (!req.userRole) {
            return next(new UnauthorizedError('User role not found'));
        }

        // Simple role hierarchy: admin > user > readonly
        const roleHierarchy: Record<string, number> = {
            'readonly': 1,
            'user': 2,
            'admin': 3
        };

        const userRoleLevel = roleHierarchy[req.userRole] || 0;
        const requiredRoleLevel = roleHierarchy[requiredRole] || 999;

        if (userRoleLevel < requiredRoleLevel) {
            return next(new ForbiddenError(`Role '${requiredRole}' required`));
        }

        next();
    };
};

/**
 * Validate API key against configured keys or database
 */
async function validateApiKey(apiKey: string): Promise<{ userId: string; role: string }> {
    // In production, this would validate against a database or external service
    // For now, we'll use environment variables for configured API keys

    const configuredKeys = process.env.API_KEYS ? JSON.parse(process.env.API_KEYS) : {};

    // Default API keys for development/testing
    const defaultKeys: Record<string, { userId: string; role: string }> = {
        'dev-admin-key-12345': { userId: 'admin-user', role: 'admin' },
        'dev-user-key-67890': { userId: 'regular-user', role: 'user' },
        'dev-readonly-key-11111': { userId: 'readonly-user', role: 'readonly' }
    };

    const allKeys = { ...defaultKeys, ...configuredKeys };
    const keyInfo = allKeys[apiKey];

    if (!keyInfo) {
        throw new UnauthorizedError('Invalid API key');
    }

    return keyInfo;
}

/**
 * Validate JWT token
 */
async function validateJwtToken(token: string): Promise<{ userId: string; role: string }> {
    // In production, this would validate JWT signature and expiration
    // For now, we'll do basic validation

    try {
        // Simple JWT structure validation
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }

        // Decode payload (in production, verify signature first)
        const payload = JSON.parse(Buffer.from(parts[1] || '', 'base64').toString());

        // Check expiration
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            throw new UnauthorizedError('Token expired');
        }

        // Extract user information
        const userId = payload.sub || payload.userId;
        const role = payload.role || 'user';

        if (!userId) {
            throw new Error('User ID not found in token');
        }

        return { userId, role };
    } catch (error) {
        throw new UnauthorizedError('Invalid JWT token');
    }
}

/**
 * Optional authentication middleware - doesn't fail if no auth provided
 */
export const optionalAuthMiddleware = async (
    req: ApiRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        await authMiddleware(req, res, next);
    } catch (error) {
        // Continue without authentication for optional endpoints
        next();
    }
};
