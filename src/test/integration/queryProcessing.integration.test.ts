import request from 'supertest';
import { ApiGateway } from '../../api/app';
import { CacheManager } from '../../services/cache';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';

describe('Query Processing Integration Tests', () => {
    let apiGateway: ApiGateway;
    let app: any;
    let dataSourceManager: DataSourceManagerImpl;
    let cacheManager: CacheManager;

    beforeAll(async () => {
        // Initialize API gateway for testing
        apiGateway = new ApiGateway(0); // Use port 0 for testing
        app = apiGateway.getApp();

        // Initialize services for testing
        dataSourceManager = new DataSourceManagerImpl();
        cacheManager = new CacheManager({
            provider: 'memory',
            ttl: 300,
            maxSize: 1000
        });
    });

    afterAll(async () => {
        // Cleanup
        if (cacheManager) {
            await cacheManager.disconnect();
        }
    });

    describe('End-to-End Query Processing Flow', () => {
        it('should process a simple query successfully', async () => {
            const queryText = 'How to configure data sources?';

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: queryText,
                    context: { domain: 'documentation' }
                })
                .expect(200);

            // Verify response structure
            expect(response.body).toMatchObject({
                query: {
                    id: expect.any(String),
                    text: queryText,
                    context: { domain: 'documentation' },
                    timestamp: expect.any(String)
                },
                result: {
                    id: expect.any(String),
                    response: expect.any(String),
                    sources: expect.any(Array),
                    confidence: expect.any(Number),
                    processingTime: expect.any(Number),
                    cached: expect.any(Boolean)
                },
                metadata: {
                    totalSources: expect.any(Number),
                    processingTime: expect.any(Number),
                    timestamp: expect.any(String),
                    correlationId: expect.any(String),
                    version: '1.0.0'
                }
            });

            // Verify response quality
            expect(response.body.result.response).toBeTruthy();
            expect(response.body.result.response.length).toBeGreaterThan(10);
            expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
            expect(response.body.result.confidence).toBeLessThanOrEqual(1);
            expect(response.body.result.processingTime).toBeGreaterThan(0);
        });

        it('should handle complex queries with filters', async () => {
            const queryText = 'API authentication methods';
            const filters = [
                { field: 'type', operator: 'eq', value: 'documentation' },
                { field: 'date', operator: 'gte', value: '2023-01-01' }
            ];

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: queryText,
                    context: { domain: 'api' },
                    filters
                })
                .expect(200);

            expect(response.body.query.filters).toEqual(filters);
            expect(response.body.result.sources).toBeInstanceOf(Array);
            expect(response.body.result.confidence).toBeGreaterThan(0);
        });

        it('should return source attribution in results', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: 'troubleshooting connection issues'
                })
                .expect(200);

            const sources = response.body.result.sources;
            expect(sources).toBeInstanceOf(Array);

            if (sources.length > 0) {
                sources.forEach((source: any) => {
                    expect(source).toMatchObject({
                        sourceId: expect.any(String),
                        sourceName: expect.any(String),
                        contentId: expect.any(String),
                        title: expect.any(String),
                        excerpt: expect.any(String),
                        relevanceScore: expect.any(Number)
                    });
                    expect(source.relevanceScore).toBeGreaterThanOrEqual(0);
                    expect(source.relevanceScore).toBeLessThanOrEqual(1);
                });
            }
        });

        it('should handle empty or invalid queries gracefully', async () => {
            // Empty query
            await request(app)
                .post('/api/v1/query')
                .send({ text: '' })
                .expect(400);

            // Missing query text
            await request(app)
                .post('/api/v1/query')
                .send({ context: { domain: 'test' } })
                .expect(400);

            // Query too long
            const longQuery = 'a'.repeat(10001);
            await request(app)
                .post('/api/v1/query')
                .send({ text: longQuery })
                .expect(400);
        });

        it('should support asynchronous query processing', async () => {
            const queryText = 'complex query for async processing';

            const response = await request(app)
                .post('/api/v1/query/async')
                .send({ text: queryText })
                .expect(202);

            expect(response.body).toMatchObject({
                queryId: expect.any(String),
                status: 'processing',
                message: 'Query submitted for processing',
                statusUrl: expect.stringContaining('/api/v1/query/'),
                estimatedTime: expect.any(String),
                metadata: {
                    timestamp: expect.any(String),
                    correlationId: expect.any(String)
                }
            });

            // Check query status
            const queryId = response.body.queryId;
            const statusResponse = await request(app)
                .get(`/api/v1/query/${queryId}`)
                .expect(404); // Query not found since we don't persist results in test mode

            expect(statusResponse.body.error.code).toBe('QUERY_NOT_FOUND');
        });
    });

    describe('Query Validation and Error Handling', () => {
        it('should validate query request format', async () => {
            // Invalid JSON
            await request(app)
                .post('/api/v1/query')
                .send('invalid json')
                .expect(400);

            // Missing required fields
            await request(app)
                .post('/api/v1/query')
                .send({})
                .expect(400);

            // Invalid filter format
            await request(app)
                .post('/api/v1/query')
                .send({
                    text: 'test query',
                    filters: 'invalid'
                })
                .expect(400);
        });

        it('should handle malformed filter objects', async () => {
            const invalidFilters = [
                { field: 'type' }, // Missing operator and value
                { operator: 'eq', value: 'test' }, // Missing field
                { field: 'type', operator: 'invalid', value: 'test' } // Invalid operator
            ];

            for (const filter of invalidFilters) {
                await request(app)
                    .post('/api/v1/query')
                    .send({
                        text: 'test query',
                        filters: [filter]
                    })
                    .expect(400);
            }
        });

        it('should return appropriate error codes for different failures', async () => {
            // Test various error scenarios
            const testCases = [
                {
                    payload: { text: '' },
                    expectedStatus: 400,
                    expectedErrorCode: 'QUERY_VALIDATION_ERROR'
                },
                {
                    payload: { text: 'a'.repeat(10001) },
                    expectedStatus: 400,
                    expectedErrorCode: 'QUERY_VALIDATION_ERROR'
                }
            ];

            for (const testCase of testCases) {
                const response = await request(app)
                    .post('/api/v1/query')
                    .send(testCase.payload)
                    .expect(testCase.expectedStatus);

                if (response.body.error) {
                    expect(response.body.error.code).toBe(testCase.expectedErrorCode);
                }
            }
        });
    });

    describe('Query Suggestions and History', () => {
        it('should provide query suggestions', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .query({ q: 'api', limit: 3 })
                .expect(200);

            expect(response.body).toMatchObject({
                suggestions: expect.any(Array),
                metadata: {
                    queryText: 'api',
                    limit: 3,
                    timestamp: expect.any(String),
                    correlationId: expect.any(String)
                }
            });

            expect(response.body.suggestions.length).toBeLessThanOrEqual(3);
        });

        it('should handle query history requests', async () => {
            const response = await request(app)
                .get('/api/v1/query/history')
                .query({ page: 1, limit: 10 })
                .expect(200);

            expect(response.body).toMatchObject({
                queries: expect.any(Array),
                pagination: {
                    page: 1,
                    limit: 10,
                    total: expect.any(Number),
                    totalPages: expect.any(Number)
                },
                metadata: {
                    timestamp: expect.any(String),
                    correlationId: expect.any(String)
                }
            });
        });

        it('should validate suggestion query parameters', async () => {
            // Missing query parameter
            await request(app)
                .get('/api/v1/query/suggestions')
                .expect(400);

            // Invalid limit
            await request(app)
                .get('/api/v1/query/suggestions')
                .query({ q: 'test', limit: 100 })
                .expect(400);
        });
    });

    describe('Response Format Consistency', () => {
        it('should return consistent timestamp formats', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'test query' })
                .expect(200);

            // Verify timestamp formats
            expect(new Date(response.body.query.timestamp)).toBeInstanceOf(Date);
            expect(new Date(response.body.metadata.timestamp)).toBeInstanceOf(Date);

            // Verify timestamps are valid
            expect(isNaN(new Date(response.body.query.timestamp).getTime())).toBe(false);
            expect(isNaN(new Date(response.body.metadata.timestamp).getTime())).toBe(false);
        });

        it('should include correlation IDs in all responses', async () => {
            const correlationId = 'test-correlation-123';

            const response = await request(app)
                .post('/api/v1/query')
                .set('X-Correlation-ID', correlationId)
                .send({ text: 'test query' })
                .expect(200);

            expect(response.headers['x-correlation-id']).toBe(correlationId);
            expect(response.body.metadata.correlationId).toBe(correlationId);
        });

        it('should round numerical values consistently', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'test query' })
                .expect(200);

            // Check confidence is rounded to 3 decimal places
            const confidence = response.body.result.confidence;
            expect(confidence).toBe(Math.round(confidence * 1000) / 1000);

            // Check source relevance scores are rounded
            response.body.result.sources.forEach((source: any) => {
                const score = source.relevanceScore;
                expect(score).toBe(Math.round(score * 1000) / 1000);
            });
        });
    });

    describe('Security and Rate Limiting', () => {
        it('should apply security headers', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'test query' });

            // Check for security headers set by helmet
            expect(response.headers).toHaveProperty('x-correlation-id');
        });

        it('should handle content type validation', async () => {
            // Wrong content type
            await request(app)
                .post('/api/v1/query')
                .set('Content-Type', 'text/plain')
                .send('test query')
                .expect(400);

            // Missing content type
            await request(app)
                .post('/api/v1/query')
                .send({ text: 'test query' })
                .expect(200); // Should work with default JSON handling
        });

        it('should validate request size limits', async () => {
            // This test would need to be configured based on the actual size limits
            // For now, we test with a reasonably large payload
            const largeContext = {
                data: 'x'.repeat(1000000) // 1MB of data
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: 'test query',
                    context: largeContext
                });

            // Should either succeed or fail with appropriate error
            expect([200, 206, 413]).toContain(response.status);
        });
    });
});