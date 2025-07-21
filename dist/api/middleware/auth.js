"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.optionalAuthMiddleware = exports.requireRole = exports.authMiddleware = exports.ForbiddenError = exports.UnauthorizedError = void 0;
class UnauthorizedError extends Error {
    constructor(message = 'Authentication required') {
        super(message);
        this.name = 'UnauthorizedError';
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends Error {
    constructor(message = 'Access denied') {
        super(message);
        this.name = 'ForbiddenError';
    }
}
exports.ForbiddenError = ForbiddenError;
const authMiddleware = async (req, _res, next) => {
    try {
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers['x-api-key'];
        if ((process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') && process.env.SKIP_AUTH === 'true') {
            req.userId = 'dev-user';
            req.userRole = 'admin';
            return next();
        }
        let token;
        let authMethod;
        if (authHeader) {
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                token = parts[1];
                authMethod = token && token.includes('.') ? 'jwt' : 'api-key';
            }
        }
        if (!token && apiKeyHeader) {
            token = apiKeyHeader;
            authMethod = 'api-key';
        }
        if (!token) {
            throw new UnauthorizedError('No authentication token provided');
        }
        let userId;
        let userRole = 'user';
        if (authMethod === 'api-key') {
            const result = await validateApiKey(token);
            userId = result.userId;
            userRole = result.role;
        }
        else if (authMethod === 'jwt') {
            const result = await validateJwtToken(token);
            userId = result.userId;
            userRole = result.role;
        }
        else {
            throw new UnauthorizedError('Invalid authentication method');
        }
        req.userId = userId;
        req.userRole = userRole;
        next();
    }
    catch (error) {
        next(error);
    }
};
exports.authMiddleware = authMiddleware;
const requireRole = (requiredRole) => {
    return (req, _res, next) => {
        if (!req.userRole) {
            return next(new UnauthorizedError('User role not found'));
        }
        const roleHierarchy = {
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
exports.requireRole = requireRole;
async function validateApiKey(apiKey) {
    const configuredKeys = process.env.API_KEYS ? JSON.parse(process.env.API_KEYS) : {};
    const defaultKeys = {
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
async function validateJwtToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid JWT format');
        }
        const payload = JSON.parse(Buffer.from(parts[1] || '', 'base64').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
            throw new UnauthorizedError('Token expired');
        }
        const userId = payload.sub || payload.userId;
        const role = payload.role || 'user';
        if (!userId) {
            throw new Error('User ID not found in token');
        }
        return { userId, role };
    }
    catch (error) {
        throw new UnauthorizedError('Invalid JWT token');
    }
}
const optionalAuthMiddleware = async (req, res, next) => {
    try {
        await (0, exports.authMiddleware)(req, res, next);
    }
    catch (error) {
        next();
    }
};
exports.optionalAuthMiddleware = optionalAuthMiddleware;
//# sourceMappingURL=auth.js.map