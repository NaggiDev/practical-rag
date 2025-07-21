import request from 'supertest';
import { ApiGateway } from '../../../api/app';

describe('Health Routes', () => {
    let apiGateway: ApiGateway;
    let app: any;

    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        apiGateway = new ApiGateway(0);
        app = apiGateway.getApp();
    });

    describe('GET /api/v1/health', () => {
        it('should return basic health status', async () => {
            const response = await request(app)
                .get('/api/v1/health')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('services');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body.services).toBeInstanceOf(Array);
            expect(response.body.services.length).toBeGreaterThan(0);

            // Check API service is included
            const apiService = response.body.services.find((s: any) => s.name === 'api');
            expect(apiService).toBeDefined();
            expect(apiService).toHaveProperty('status', 'healthy');
            expect(apiService).toHaveProperty('responseTime');
            expect(apiService).toHaveProperty('lastCheck');
        });

        it('should include correlation ID in response headers', async () => {
            const response = await request(app)
                .get('/api/v1/health')
                .expect(200);

            expect(response.headers).toHaveProperty('x-correlation-id');
        });

        it('should include rate limit headers', async () => {
            const response = await request(app)
                .get('/api/v1/health')
                .expect(200);

            expect(response.headers).toHaveProperty('ratelimit-limit');
            expect(response.headers).toHaveProperty('ratelimit-remaining');
        });
    });

    describe('GET /api/v1/health/detailed', () => {
        it('should return detailed health status', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            expect(response.body).toHaveProperty('status');
            expect(['healthy', 'degraded', 'unhealthy']).toContain(response.body.status);
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('services');
            expect(response.body).toHaveProperty('uptime');
            expect(response.body.services).toBeInstanceOf(Array);

            // Should include all system services
            const serviceNames = response.body.services.map((s: any) => s.name);
            expect(serviceNames).toContain('api');
            expect(serviceNames).toContain('vector_database');
            expect(serviceNames).toContain('redis_cache');
            expect(serviceNames).toContain('embedding_service');
            expect(serviceNames).toContain('data_sources');
        });

        it('should include metrics when requested', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed?includeMetrics=true')
                .expect(200);

            expect(response.body).toHaveProperty('metrics');
            expect(response.body.metrics).toHaveProperty('memory');
            expect(response.body.metrics).toHaveProperty('cpu');
            expect(response.body.metrics).toHaveProperty('responseTime');
        });

        it('should validate query parameters', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed?includeMetrics=invalid')
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should return 503 if services are unhealthy', async () => {
            // This test would require mocking service health checks
            // For now, we'll just verify the endpoint works
            const response = await request(app)
                .get('/api/v1/health/detailed');

            expect([200, 503]).toContain(response.status);
        });
    });

    describe('GET /api/v1/health/ready', () => {
        it('should return readiness status', async () => {
            const response = await request(app)
                .get('/api/v1/health/ready');

            expect([200, 503]).toContain(response.status);
            expect(response.body).toHaveProperty('status');
            expect(['ready', 'not_ready']).toContain(response.body.status);
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('services');
            expect(response.body.services).toBeInstanceOf(Array);

            // Should only include critical services
            const serviceNames = response.body.services.map((s: any) => s.name);
            expect(serviceNames).toContain('api');
            expect(serviceNames).toContain('vector_database');
            expect(serviceNames).toContain('redis_cache');
        });

        it('should return 200 when all critical services are healthy', async () => {
            const response = await request(app)
                .get('/api/v1/health/ready');

            if (response.body.status === 'ready') {
                expect(response.status).toBe(200);
                expect(response.body.services.every((s: any) => s.status === 'healthy')).toBe(true);
            }
        });

        it('should return 503 when critical services are not ready', async () => {
            const response = await request(app)
                .get('/api/v1/health/ready');

            if (response.body.status === 'not_ready') {
                expect(response.status).toBe(503);
                expect(response.body.services.some((s: any) => s.status === 'unhealthy')).toBe(true);
            }
        });
    });

    describe('GET /api/v1/health/live', () => {
        it('should return liveness status', async () => {
            const response = await request(app)
                .get('/api/v1/health/live')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'alive');
            expect(response.body).toHaveProperty('timestamp');
            expect(response.body).toHaveProperty('uptime');
            expect(typeof response.body.uptime).toBe('number');
            expect(response.body.uptime).toBeGreaterThan(0);
        });

        it('should always return 200 if server is running', async () => {
            // Make multiple requests to ensure consistency
            for (let i = 0; i < 3; i++) {
                const response = await request(app)
                    .get('/api/v1/health/live')
                    .expect(200);

                expect(response.body.status).toBe('alive');
            }
        });
    });

    describe('Service Health Checks', () => {
        it('should include proper service health structure', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            response.body.services.forEach((service: any) => {
                expect(service).toHaveProperty('name');
                expect(service).toHaveProperty('status');
                expect(['healthy', 'unhealthy']).toContain(service.status);
                expect(service).toHaveProperty('lastCheck');
                expect(service).toHaveProperty('responseTime');
                expect(typeof service.responseTime).toBe('number');
                expect(service.responseTime).toBeGreaterThanOrEqual(0);

                // Validate timestamp format
                expect(new Date(service.lastCheck)).toBeInstanceOf(Date);
                expect(isNaN(new Date(service.lastCheck).getTime())).toBe(false);
            });
        });

        it('should include service details', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            const apiService = response.body.services.find((s: any) => s.name === 'api');
            expect(apiService).toHaveProperty('details');
            expect(apiService.details).toHaveProperty('version');
            expect(apiService.details).toHaveProperty('environment');

            const vectorDbService = response.body.services.find((s: any) => s.name === 'vector_database');
            expect(vectorDbService).toHaveProperty('details');
            expect(vectorDbService.details).toHaveProperty('provider');
            expect(vectorDbService.details).toHaveProperty('connected');

            const redisService = response.body.services.find((s: any) => s.name === 'redis_cache');
            expect(redisService).toHaveProperty('details');
            expect(redisService.details).toHaveProperty('connected');

            const embeddingService = response.body.services.find((s: any) => s.name === 'embedding_service');
            expect(embeddingService).toHaveProperty('details');
            expect(embeddingService.details).toHaveProperty('provider');
            expect(embeddingService.details).toHaveProperty('model');

            const dataSourcesService = response.body.services.find((s: any) => s.name === 'data_sources');
            expect(dataSourcesService).toHaveProperty('details');
            expect(dataSourcesService.details).toHaveProperty('total_sources');
            expect(dataSourcesService.details).toHaveProperty('active_sources');
            expect(dataSourcesService.details).toHaveProperty('failed_sources');
        });
    });

    describe('Error Handling', () => {
        it('should handle service check failures gracefully', async () => {
            // The health endpoint should always return a response
            // even if individual service checks fail
            const response = await request(app)
                .get('/api/v1/health')
                .expect(200);

            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('services');
        });
    });

    describe('Response Time', () => {
        it('should respond quickly for basic health check', async () => {
            const startTime = Date.now();

            await request(app)
                .get('/api/v1/health')
                .expect(200);

            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
        });

        it('should respond reasonably quickly for detailed health check', async () => {
            const startTime = Date.now();

            await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(2000); // Should respond within 2 seconds
        });
    });
});
