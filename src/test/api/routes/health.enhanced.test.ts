import express from 'express';
import request from 'supertest';
import { healthRoutes } from '../../../api/routes/health';

// Mock the health check service
jest.mock('../../../services/healthCheck');
jest.mock('../../../services/cache');
jest.mock('../../../services/dataSourceManager');
jest.mock('../../../services/monitoring');
jest.mock('../../../services/embedding');
jest.mock('../../../services/vectorSearch');

describe('Enhanced Health Routes', () => {
    let app: express.Application;

    beforeEach(() => {
        app = express();
        app.use(express.json());
        app.use('/health', healthRoutes);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /health/trends', () => {
        it('should return performance trends', async () => {
            const response = await request(app)
                .get('/health/trends')
                .expect(200);

            expect(response.body).toMatchObject({
                trends: expect.objectContaining({
                    responseTime: expect.objectContaining({
                        trend: expect.any(Number),
                        currentAverage: expect.any(Number),
                        previousAverage: expect.any(Number),
                        isDegrading: expect.any(Boolean)
                    }),
                    errorRate: expect.objectContaining({
                        trend: expect.any(Number),
                        currentAverage: expect.any(Number),
                        previousAverage: expect.any(Number),
                        isIncreasing: expect.any(Boolean)
                    }),
                    memoryUsage: expect.objectContaining({
                        trend: expect.any(Number),
                        currentAverage: expect.any(Number),
                        previousAverage: expect.any(Number),
                        isIncreasing: expect.any(Boolean)
                    }),
                    cacheHitRate: expect.objectContaining({
                        trend: expect.any(Number),
                        currentAverage: expect.any(Number),
                        previousAverage: expect.any(Number),
                        isDecreasing: expect.any(Boolean)
                    })
                }),
                timestamp: expect.any(String)
            });
        });
    });

    describe('GET /health/sources', () => {
        it('should return enhanced data source health information', async () => {
            const response = await request(app)
                .get('/health/sources');

            expect([200, 503]).toContain(response.status);
            expect(response.body).toMatchObject({
                totalSources: expect.any(Number),
                healthySources: expect.any(Number),
                unhealthySources: expect.any(Number),
                degradedSources: expect.any(Number),
                lastChecked: expect.any(String),
                overallStatus: expect.stringMatching(/healthy|degraded|unhealthy/),
                sources: expect.any(Array)
            });

            // If there are sources, check their structure
            if (response.body.sources.length > 0) {
                expect(response.body.sources[0]).toMatchObject({
                    id: expect.any(String),
                    name: expect.any(String),
                    type: expect.any(String),
                    status: expect.stringMatching(/healthy|degraded|unhealthy/)
                });

                // Check for enhanced properties (might be undefined in test environment)
                const source = response.body.sources[0];
                expect(source).toHaveProperty('connectionAttempts');
                expect(source).toHaveProperty('consecutiveFailures');
                expect(source).toHaveProperty('lastSuccessfulConnection');
            }
        });
    });

    describe('Health check integration', () => {
        it('should handle data source connectivity monitoring', async () => {
            // First check the sources endpoint
            await request(app).get('/health/sources');

            // Then check the overall health which should include data source health
            const response = await request(app).get('/health');

            expect([200, 503]).toContain(response.status);

            // Find the data_sources component in the response
            const dataSourcesComponent = response.body.services.find(
                (s: any) => s.name === 'data_sources'
            );

            // If it exists, check its structure
            if (dataSourcesComponent) {
                expect(dataSourcesComponent).toMatchObject({
                    name: 'data_sources',
                    status: expect.stringMatching(/healthy|unhealthy/),
                    details: expect.objectContaining({
                        totalSources: expect.any(Number),
                        healthySources: expect.any(Number),
                        unhealthySources: expect.any(Number)
                    })
                });
            }
        });
    });
});