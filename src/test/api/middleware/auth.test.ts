import express from 'express';
import request from 'supertest';
import { authMiddleware, ForbiddenError, requireRole, UnauthorizedError } from '../../../api/middleware/auth';

describe('Authentication Middleware', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Test route with auth middleware
        app.get('/protected', authMiddleware as any, (req: any, res) => {
            res.json({
                message: 'Access granted',
                userId: req.userId,
                userRole: req.userRole
            });
        });

        // Test route with role requirement
        app.get('/admin-only', authMiddleware as any, requireRole('admin'), (_req: any, res) => {
            res.json({ message: 'Admin access granted' });
        });

        // Error handler
        app.use((error: any, _req: any, res: any, _next: any) => {
            if (error.name === 'UnauthorizedError') {
                return res.status(401).json({ error: error.message });
            }
            if (error.name === 'ForbiddenError') {
                return res.status(403).json({ error: error.message });
            }
            res.status(500).json({ error: 'Internal server error' });
        });
    });

    describe('API Key Authentication', () => {
        it('should authenticate with valid API key in Authorization header', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer dev-admin-key-12345')
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Access granted');
            expect(response.body).toHaveProperty('userId', 'admin-user');
            expect(response.body).toHaveProperty('userRole', 'admin');
        });

        it('should authenticate with valid API key in X-API-Key header', async () => {
            const response = await request(app)
                .get('/protected')
                .set('X-API-Key', 'dev-user-key-67890')
                .expect(200);

            expect(response.body).toHaveProperty('userId', 'regular-user');
            expect(response.body).toHaveProperty('userRole', 'user');
        });

        it('should reject invalid API key', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer invalid-key')
                .expect(401);

            expect(response.body).toHaveProperty('error', 'Invalid API key');
        });

        it('should reject missing authentication', async () => {
            const response = await request(app)
                .get('/protected')
                .expect(401);

            expect(response.body).toHaveProperty('error', 'No authentication token provided');
        });
    });

    describe('JWT Authentication', () => {
        it('should authenticate with valid JWT token', async () => {
            // Create a simple JWT-like token for testing
            const payload = {
                sub: 'test-user',
                role: 'user',
                exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
            };
            const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;

            const response = await request(app)
                .get('/protected')
                .set('Authorization', `Bearer ${token}`)
                .expect(200);

            expect(response.body).toHaveProperty('userId', 'test-user');
            expect(response.body).toHaveProperty('userRole', 'user');
        });

        it('should reject expired JWT token', async () => {
            const payload = {
                sub: 'test-user',
                role: 'user',
                exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
            };
            const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64')}.signature`;

            const response = await request(app)
                .get('/protected')
                .set('Authorization', `Bearer ${token}`)
                .expect(401);

            expect(response.body).toHaveProperty('error', 'Token expired');
        });

        it('should reject malformed JWT token', async () => {
            const response = await request(app)
                .get('/protected')
                .set('Authorization', 'Bearer invalid.jwt')
                .expect(401);

            expect(response.body).toHaveProperty('error', 'Invalid JWT token');
        });
    });

    describe('Role-based Authorization', () => {
        it('should allow admin access to admin-only endpoint', async () => {
            const response = await request(app)
                .get('/admin-only')
                .set('Authorization', 'Bearer dev-admin-key-12345')
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Admin access granted');
        });

        it('should deny user access to admin-only endpoint', async () => {
            const response = await request(app)
                .get('/admin-only')
                .set('Authorization', 'Bearer dev-user-key-67890')
                .expect(403);

            expect(response.body).toHaveProperty('error', "Role 'admin' required");
        });

        it('should deny readonly access to admin-only endpoint', async () => {
            const response = await request(app)
                .get('/admin-only')
                .set('Authorization', 'Bearer dev-readonly-key-11111')
                .expect(403);

            expect(response.body).toHaveProperty('error', "Role 'admin' required");
        });
    });

    describe('Development Mode', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'development';
            process.env.SKIP_AUTH = 'true';
        });

        afterEach(() => {
            delete process.env.SKIP_AUTH;
            process.env.NODE_ENV = 'test';
        });

        it('should skip authentication in development mode', async () => {
            const response = await request(app)
                .get('/protected')
                .expect(200);

            expect(response.body).toHaveProperty('userId', 'dev-user');
            expect(response.body).toHaveProperty('userRole', 'admin');
        });
    });

    describe('Error Classes', () => {
        it('should create UnauthorizedError correctly', () => {
            const error = new UnauthorizedError('Custom message');
            expect(error.name).toBe('UnauthorizedError');
            expect(error.message).toBe('Custom message');
        });

        it('should create ForbiddenError correctly', () => {
            const error = new ForbiddenError('Access denied');
            expect(error.name).toBe('ForbiddenError');
            expect(error.message).toBe('Access denied');
        });
    });
});