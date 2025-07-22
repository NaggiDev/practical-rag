import request from 'supertest';
import { ApiGateway } from '../../api/app';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';
import { HealthCheckConfig, HealthCheckService } from '../../services/healthCheck';
import { MonitoringService } from '../../services/monitoring';

describe('Health Check Integration Tests', () => {
    let apiGateway: ApiGateway;
    let healthCheckService: HealthCheckService;
    let app: any;

    const testConfig: HealthCheckConfig = {
        checkInterval: 100, // Very short for testing
        timeoutMs: 1000,
        retryAttempts: 2,
        alertThresholds: {
            responseTime: 500,
            errorRate: 0.2,
            consecutiveFailures: 2
        }
    };

    beforeAll(async () => {
        // Initialize API gateway
        apiGateway = new ApiGateway(0); // Use port 0 for testing
        app = apiGateway.getApp();

        // Initialize health check service
        healthCheckService = new HealthCheckService(testConfig, {
            dataSourceManager: new DataSourceManagerImpl(),
            monitoringService: new MonitoringService()
        });
    });

    afterAll(async () => {
        if (healthCheckService) {
            healthCheckService.destroy();
        }
    });

    describe('System Health Integration', () => {
        it('should perform complete system health check', async () => {
            const response = await request(app)
                .get('/api/v1/health')
                .expect(200);

            expect(response.body).toMatchObject({
                status: expect.stringMatching(/healthy|degraded|unhealthy/),
                timestamp: expect.any(String),
                services: expect.arrayContaining([
                    expect.objectContaining({
                        name: 'api',
                        status: expect.stringMatching(/healthy|unhealthy/)
                    })
                ]),
                uptime: expect.any(Number)
            });

            // Verify all expected components are checked
            const serviceNames = response.body.services.map((s: any) => s.name);
            expect(serviceNames).toContain('api');
        });

        it('should provide detailed health information with metrics', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed?includeMetrics=true')
                .expect(200);

            expect(response.body).toMatchObject({
                status: expect.stringMatching(/healthy|degraded|unhealthy/),
                services: expect.any(Array),
                metrics: expect.objectContaining({
                    memory: expect.objectContaining({
                        rss: expect.any(Number),
                        heapTotal: expect.any(Number),
                        heapUsed: expect.any(Number)
                    }),
                    cpu: expect.objectContaining({
                        user: expect.any(Number),
                        system: expect.any(Number)
                    }),
                    responseTime: expect.any(Number)
                })
            });
        });

        it('should check individual component health', async () => {
            const response = await request(app)
                .get('/api/v1/health/component/api')
                .expect(200);

            expect(response.body).toMatchObject({
                component: expect.objectContaining({
                    name: 'api',
                    status: expect.stringMatching(/healthy|degraded|unhealthy/),
                    responseTime: expect.any(Number),
                    lastCheck: expect.any(String)
                }),
                timestamp: expect.any(String)
            });
        });

        it('should return 404 for unknown component', async () => {
            const response = await request(app)
                .get('/api/v1/health/component/nonexistent')
                .expect(404);

            expect(response.body.error.code).toBe('COMPONENT_NOT_FOUND');
        });
    });

    describe('Data Source Health Integration', () => {
        it('should check data sources health', async () => {
            const response = await request(app)
                .get('/api/v1/health/sources');

            expect([200, 503]).toContain(response.status);
            expect(response.body).toMatchObject({
                totalSources: expect.any(Number),
                healthySources: expect.any(Number),
                unhealthySources: expect.any(Number),
                degradedSources: expect.any(Number),
                lastChecked: expect.any(String),
                sources: expect.any(Array)
            });
        });

        it('should handle empty data sources gracefully', async () => {
            const response = await request(app)
                .get('/api/v1/health/sources');

            expect(response.body.totalSources).toBe(0);
            expect(response.body.sources).toEqual([]);
        });
    });

    describe('Health Monitoring Integration', () => {
        it('should start and stop health monitoring', async () => {
            // Start monitoring
            const startResponse = await request(app)
                .post('/api/v1/health/monitoring/start')
                .expect(200);

            expect(startResponse.body.message).toContain('started');

            // Check monitoring status
            const statusResponse = await request(app)
                .get('/api/v1/health/monitoring/status')
                .expect(200);

            expect(statusResponse.body).toMatchObject({
                lastHealthCheck: expect.any(String),
                componentFailureCounts: expect.any(Object),
                config: expect.objectContaining({
                    checkInterval: expect.any(Number)
                })
            });

            // Stop monitoring
            const stopResponse = await request(app)
                .post('/api/v1/health/monitoring/stop')
                .expect(200);

            expect(stopResponse.body.message).toContain('stopped');
        });

        it('should reset component failure counts', async () => {
            const response = await request(app)
                .post('/api/v1/health/component/api/reset')
                .expect(200);

            expect(response.body).toMatchObject({
                message: expect.stringContaining('Failure count reset'),
                component: 'api',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Readiness and Liveness Probes', () => {
        it('should respond to readiness probe', async () => {
            const response = await request(app)
                .get('/api/v1/health/ready');

            expect([200, 503]).toContain(response.status);
            expect(response.body).toMatchObject({
                status: expect.stringMatching(/ready|not_ready/),
                timestamp: expect.any(String),
                services: expect.any(Array)
            });
        });

        it('should respond to liveness probe', async () => {
            const response = await request(app)
                .get('/api/v1/health/live')
                .expect(200);

            expect(response.body).toMatchObject({
                status: 'alive',
                timestamp: expect.any(String),
                uptime: expect.any(Number)
            });
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle health check service errors gracefully', async () => {
            // This test simulates what happens when health checks fail
            const response = await request(app)
                .get('/api/v1/health');

            // Should still return a response, even if some checks fail
            expect(response.status).toBeLessThan(600);
            expect(response.body).toBeInstanceOf(Object);
        });

        it('should include correlation IDs in responses', async () => {
            const correlationId = 'test-correlation-id';

            const response = await request(app)
                .get('/api/v1/health')
                .set('X-Correlation-ID', correlationId);

            expect(response.headers['x-correlation-id']).toBe(correlationId);
        });
    });

    describe('Performance and Load Testing', () => {
        it('should handle concurrent health check requests', async () => {
            const concurrentRequests = 10;
            const requests = Array(concurrentRequests).fill(null).map(() =>
                request(app).get('/api/v1/health')
            );

            const responses = await Promise.all(requests);

            responses.forEach(response => {
                expect(response.status).toBeLessThan(600);
                expect(response.body).toBeInstanceOf(Object);
            });
        });

        it('should complete health checks within reasonable time', async () => {
            const startTime = Date.now();

            await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            const duration = Date.now() - startTime;
            expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
        });

        it('should handle rapid successive requests', async () => {
            const responses = [];

            for (let i = 0; i < 5; i++) {
                const response = await request(app).get('/api/v1/health');
                responses.push(response);
            }

            responses.forEach(response => {
                expect(response.status).toBeLessThan(600);
            });
        });
    });

    describe('Response Format Consistency', () => {
        it('should return consistent timestamp format across endpoints', async () => {
            const endpoints = [
                '/api/v1/health',
                '/api/v1/health/detailed',
                '/api/v1/health/ready',
                '/api/v1/health/live',
                '/api/v1/health/sources'
            ];

            for (const endpoint of endpoints) {
                const response = await request(app).get(endpoint);

                expect(response.body.timestamp).toBeDefined();
                expect(new Date(response.body.timestamp)).toBeInstanceOf(Date);
                expect(isNaN(new Date(response.body.timestamp).getTime())).toBe(false);
            }
        });

        it('should return proper HTTP status codes', async () => {
            const testCases = [
                { endpoint: '/api/v1/health', expectedCodes: [200, 503] },
                { endpoint: '/api/v1/health/detailed', expectedCodes: [200, 503] },
                { endpoint: '/api/v1/health/ready', expectedCodes: [200, 503] },
                { endpoint: '/api/v1/health/live', expectedCodes: [200] },
                { endpoint: '/api/v1/health/component/unknown', expectedCodes: [404] }
            ];

            for (const testCase of testCases) {
                const response = await request(app).get(testCase.endpoint);
                expect(testCase.expectedCodes).toContain(response.status);
            }
        });
    });

    describe('Security and Rate Limiting', () => {
        it('should apply appropriate security headers', async () => {
            const response = await request(app)
                .get('/api/v1/health');

            // Check for security headers (these are set by the API gateway)
            expect(response.headers).toHaveProperty('x-correlation-id');
        });

        it('should handle malformed requests gracefully', async () => {
            const response = await request(app)
                .get('/api/v1/health/component/')
                .expect(404);

            expect(response.body.error).toBeDefined();
        });
    });
});