import express from 'express';
import request from 'supertest';
import {
    burstRateLimitMiddleware,
    healthRateLimitMiddleware,
    queryRateLimitMiddleware,
    rateLimitMiddleware,
    sourcesRateLimitMiddleware
} from '../../../api/middleware/rateLimit';

describe('Rate Limiting Middleware', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());

        // Add correlation ID middleware for testing
        app.use((req: any, _res, next) => {
            req.correlationId = 'test-correlation-id';
            next();
        });
    });

    describe('General Rate Limiting', () => {
        beforeEach(() => {
            app.get('/test', rateLimitMiddleware, (_req, res) => {
                res.json({ message: 'Success' });
            });
        });

        it('should allow requests within rate limit', async () => {
            const response = await request(app)
                .get('/test')
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Success');
            expect(response.headers).toHaveProperty('ratelimit-limit');
            expect(response.headers).toHaveProperty('ratelimit-remaining');
        });

        it('should include rate limit headers', async () => {
            const response = await request(app)
                .get('/test')
                .expect(200);

            expect(response.headers).toHaveProperty('ratelimit-limit');
            expect(response.headers).toHaveProperty('ratelimit-remaining');
            expect(response.headers).toHaveProperty('ratelimit-reset');
        });

        // Note: Testing actual rate limit exceeded would require many requests
        // In a real test environment, you might want to create a separate test
        // with a very low rate limit for testing the exceeded scenario
    });

    describe('Query Rate Limiting', () => {
        beforeEach(() => {
            app.post('/query', queryRateLimitMiddleware, (_req, res) => {
                res.json({ message: 'Query processed' });
            });
        });

        it('should apply query-specific rate limits', async () => {
            const response = await request(app)
                .post('/query')
                .send({ text: 'test query' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Query processed');
            expect(response.headers).toHaveProperty('ratelimit-limit');
        });
    });

    describe('Sources Rate Limiting', () => {
        beforeEach(() => {
            app.get('/sources', sourcesRateLimitMiddleware, (_req, res) => {
                res.json({ sources: [] });
            });
        });

        it('should apply sources-specific rate limits', async () => {
            const response = await request(app)
                .get('/sources')
                .expect(200);

            expect(response.body).toHaveProperty('sources');
            expect(response.headers).toHaveProperty('ratelimit-limit');
        });
    });

    describe('Health Rate Limiting', () => {
        beforeEach(() => {
            app.get('/health', healthRateLimitMiddleware, (_req, res) => {
                res.json({ status: 'healthy' });
            });
        });

        it('should apply health-specific rate limits', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.headers).toHaveProperty('ratelimit-limit');
        });
    });

    describe('Burst Rate Limiting', () => {
        beforeEach(() => {
            app.post('/expensive', burstRateLimitMiddleware, (_req, res) => {
                res.json({ message: 'Expensive operation completed' });
            });
        });

        it('should apply burst rate limits for expensive operations', async () => {
            const response = await request(app)
                .post('/expensive')
                .send({})
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Expensive operation completed');
            expect(response.headers).toHaveProperty('ratelimit-limit');
        });
    });

    describe('Rate Limit Error Response', () => {
        let testApp: express.Application;

        beforeEach(() => {
            testApp = express();
            testApp.use(express.json());

            // Add correlation ID middleware
            testApp.use((req: any, _res, next) => {
                req.correlationId = 'test-correlation-id';
                next();
            });

            // Create a very restrictive rate limiter for testing
            const testRateLimit = require('express-rate-limit')({
                windowMs: 60000, // 1 minute
                max: 1, // Only 1 request per minute
                standardHeaders: true,
                legacyHeaders: false,
                handler: (req: any, res: any) => {
                    const error = {
                        error: {
                            code: 'RATE_LIMIT_EXCEEDED',
                            message: 'Too many requests from this IP, please try again later',
                            details: {
                                limit: 1,
                                windowMs: 60000,
                                retryAfter: 60
                            },
                            timestamp: new Date(),
                            correlationId: req.correlationId
                        }
                    };
                    res.status(429).json(error);
                }
            });

            testApp.get('/limited', testRateLimit, (_req, res) => {
                res.json({ message: 'Success' });
            });
        });

        it('should return proper error format when rate limit exceeded', async () => {
            // First request should succeed
            await request(testApp)
                .get('/limited')
                .expect(200);

            // Second request should be rate limited
            const response = await request(testApp)
                .get('/limited')
                .expect(429);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('details');
            expect(response.body.error.details).toHaveProperty('limit');
            expect(response.body.error.details).toHaveProperty('windowMs');
            expect(response.body.error.details).toHaveProperty('retryAfter');
            expect(response.body.error).toHaveProperty('correlationId', 'test-correlation-id');
        });
    });

    describe('Test Environment Skip', () => {
        beforeEach(() => {
            process.env.NODE_ENV = 'test';

            app.get('/test-skip', rateLimitMiddleware, (_req, res) => {
                res.json({ message: 'Success' });
            });
        });

        it('should skip rate limiting in test environment', async () => {
            // Make multiple requests that would normally be rate limited
            for (let i = 0; i < 5; i++) {
                const response = await request(app)
                    .get('/test-skip')
                    .expect(200);

                expect(response.body).toHaveProperty('message', 'Success');
            }
        });
    });
});
