import request from 'supertest';
import { ApiGateway } from '../../../api/app';

describe('Query Routes Integration Tests', () => {
    let apiGateway: ApiGateway;
    let app: any;

    beforeAll(async () => {
        // Set test environment
        process.env.NODE_ENV = 'test';
        process.env.SKIP_AUTH = 'true';

        // Mock configuration to avoid external dependencies
        process.env.CACHE_ENABLED = 'false';
        process.env.VECTOR_DB_PROVIDER = 'mock';
        process.env.EMBEDDING_PROVIDER = 'mock';

        apiGateway = new ApiGateway(0); // Use port 0 for testing
        app = apiGateway.getApp();
    });

    afterAll(async () => {
        // Clean up any resources
        jest.clearAllMocks();
    });

    describe('POST /api/v1/query', () => {
        const validQueryPayload = {
            text: 'What is the purpose of this system?',
            context: { domain: 'documentation' },
            filters: [
                {
                    field: 'type',
                    operator: 'eq',
                    value: 'documentation'
                }
            ]
        };

        it('should process a valid query successfully', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send(validQueryPayload)
                .expect(200);

            // Verify response structure
            expect(response.body).toHaveProperty('query');
            expect(response.body).toHaveProperty('result');
            expect(response.body).toHaveProperty('metadata');

            // Verify query object
            expect(response.body.query).toHaveProperty('id');
            expect(response.body.query).toHaveProperty('text', validQueryPayload.text);
            expect(response.body.query).toHaveProperty('context', validQueryPayload.context);
            expect(response.body.query).toHaveProperty('filters', validQueryPayload.filters);
            expect(response.body.query).toHaveProperty('timestamp');

            // Verify result object
            expect(response.body.result).toHaveProperty('id');
            expect(response.body.result).toHaveProperty('response');
            expect(response.body.result).toHaveProperty('sources');
            expect(response.body.result).toHaveProperty('confidence');
            expect(response.body.result).toHaveProperty('processingTime');
            expect(response.body.result).toHaveProperty('cached');

            // Verify metadata
            expect(response.body.metadata).toHaveProperty('totalSources');
            expect(response.body.metadata).toHaveProperty('processingTime');
            expect(response.body.metadata).toHaveProperty('timestamp');
            expect(response.body.metadata).toHaveProperty('correlationId');
            expect(response.body.metadata).toHaveProperty('version', '1.0.0');

            // Verify data types
            expect(typeof response.body.result.confidence).toBe('number');
            expect(typeof response.body.result.processingTime).toBe('number');
            expect(typeof response.body.result.cached).toBe('boolean');
            expect(Array.isArray(response.body.result.sources)).toBe(true);
        });

        it('should handle query with minimal payload', async () => {
            const minimalPayload = {
                text: 'Simple query'
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send(minimalPayload)
                .expect(200);

            expect(response.body.query.text).toBe(minimalPayload.text);
            expect(response.body.query.context).toBeUndefined();
            expect(response.body.query.filters).toBeUndefined();
        });

        it('should validate required fields', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({})
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('details');
        });

        it('should validate query text length', async () => {
            const longText = 'a'.repeat(10001); // Exceeds max length

            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: longText })
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should validate empty query text', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: '' })
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should validate filter structure', async () => {
            const invalidFilters = {
                text: 'Valid query',
                filters: [
                    {
                        field: 'type',
                        operator: 'invalid_operator',
                        value: 'test'
                    }
                ]
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send(invalidFilters)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle content-type validation', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .set('Content-Type', 'text/plain')
                .send('invalid content type')
                .expect(415);

            expect(response.body.error.code).toBe('INVALID_CONTENT_TYPE');
        });

        it('should include correlation ID in response', async () => {
            const correlationId = '12345678-1234-1234-1234-123456789012';

            const response = await request(app)
                .post('/api/v1/query')
                .set('X-Correlation-ID', correlationId)
                .send(validQueryPayload)
                .expect(200);

            expect(response.body.metadata.correlationId).toBe(correlationId);
            expect(response.headers['x-correlation-id']).toBe(correlationId);
        });

        it('should handle special characters in query text', async () => {
            const specialCharsQuery = {
                text: 'Query with special chars: @#$%^&*()[]{}|\\:";\'<>?,./'
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send(specialCharsQuery)
                .expect(200);

            expect(response.body.query.text).toBe(specialCharsQuery.text);
        });

        it('should handle unicode characters in query text', async () => {
            const unicodeQuery = {
                text: 'Query with unicode: 你好世界 🌍 café naïve résumé'
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send(unicodeQuery)
                .expect(200);

            expect(response.body.query.text).toBe(unicodeQuery.text);
        });
    });

    describe('POST /api/v1/query/async', () => {
        const validQueryPayload = {
            text: 'Async query test',
            context: { priority: 'low' }
        };

        it('should accept async query and return processing status', async () => {
            const response = await request(app)
                .post('/api/v1/query/async')
                .send(validQueryPayload)
                .expect(202);

            expect(response.body).toHaveProperty('queryId');
            expect(response.body).toHaveProperty('status', 'processing');
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('statusUrl');
            expect(response.body).toHaveProperty('estimatedTime');
            expect(response.body).toHaveProperty('metadata');

            // Verify UUID format
            expect(response.body.queryId).toMatch(/^[0-9a-f-]{36}$/);

            // Verify status URL format
            expect(response.body.statusUrl).toBe(`/api/v1/query/${response.body.queryId}`);
        });

        it('should validate async query payload', async () => {
            const response = await request(app)
                .post('/api/v1/query/async')
                .send({})
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/query/:queryId', () => {
        it('should return 404 for non-existent query', async () => {
            const queryId = '12345678-1234-1234-1234-123456789012';

            const response = await request(app)
                .get(`/api/v1/query/${queryId}`)
                .expect(404);

            expect(response.body.error.code).toBe('QUERY_NOT_FOUND');
            expect(response.body.error.message).toContain('not found');
        });

        it('should validate UUID format', async () => {
            const invalidId = 'invalid-uuid';

            const response = await request(app)
                .get(`/api/v1/query/${invalidId}`)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle processing status check', async () => {
            // First submit an async query
            const submitResponse = await request(app)
                .post('/api/v1/query/async')
                .send({ text: 'Test query for status check' })
                .expect(202);

            const queryId = submitResponse.body.queryId;

            // Immediately check status (should be processing or completed)
            const statusResponse = await request(app)
                .get(`/api/v1/query/${queryId}`)
                .expect((res) => {
                    expect([202, 404]).toContain(res.status);
                });

            if (statusResponse.status === 202) {
                expect(statusResponse.body.status).toBe('processing');
                expect(statusResponse.body.queryId).toBe(queryId);
                expect(statusResponse.body).toHaveProperty('processingTime');
            }
        });
    });

    describe('DELETE /api/v1/query/:queryId', () => {
        it('should return 404 for non-existent query cancellation', async () => {
            const queryId = '12345678-1234-1234-1234-123456789012';

            const response = await request(app)
                .delete(`/api/v1/query/${queryId}`)
                .expect(404);

            expect(response.body.error.code).toBe('QUERY_NOT_FOUND');
        });

        it('should validate UUID format for cancellation', async () => {
            const invalidId = 'invalid-uuid';

            const response = await request(app)
                .delete(`/api/v1/query/${invalidId}`)
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/query/suggestions', () => {
        it('should return query suggestions', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .query({ q: 'how to', limit: 3 })
                .expect(200);

            expect(response.body).toHaveProperty('suggestions');
            expect(response.body).toHaveProperty('metadata');
            expect(Array.isArray(response.body.suggestions)).toBe(true);
            expect(response.body.suggestions.length).toBeLessThanOrEqual(3);
        });

        it('should validate suggestion query parameters', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .query({ limit: 3 }) // Missing required 'q' parameter
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });

        it('should handle limit parameter validation', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .query({ q: 'test', limit: 100 }) // Exceeds max limit
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/query/history', () => {
        it('should return empty query history', async () => {
            const response = await request(app)
                .get('/api/v1/query/history')
                .expect(200);

            expect(response.body).toHaveProperty('queries');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body).toHaveProperty('metadata');
            expect(Array.isArray(response.body.queries)).toBe(true);
        });

        it('should handle pagination parameters', async () => {
            const response = await request(app)
                .get('/api/v1/query/history')
                .query({ page: 2, limit: 10 })
                .expect(200);

            expect(response.body.pagination.page).toBe(2);
            expect(response.body.pagination.limit).toBe(10);
        });

        it('should validate pagination parameters', async () => {
            const response = await request(app)
                .get('/api/v1/query/history')
                .query({ page: 0, limit: 200 }) // Invalid page and limit
                .expect(400);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
        });
    });

    describe('Error Handling and Edge Cases', () => {
        it('should handle malformed JSON', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .set('Content-Type', 'application/json')
                .send('{"invalid": json}')
                .expect(400);

            expect(response.body).toHaveProperty('error');
        });

        it('should handle large request bodies', async () => {
            const largeContext = {
                data: 'x'.repeat(1024 * 1024) // 1MB of data
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: 'Test query',
                    context: largeContext
                })
                .expect((res) => {
                    // Should either succeed or fail with appropriate error
                    expect([200, 413]).toContain(res.status);
                });

            if (response.status === 413) {
                expect(response.body.error.code).toBe('REQUEST_TOO_LARGE');
            }
        });

        it('should handle concurrent requests', async () => {
            const promises = Array.from({ length: 5 }, (_, i) =>
                request(app)
                    .post('/api/v1/query')
                    .send({ text: `Concurrent query ${i}` })
            );

            const responses = await Promise.all(promises);

            responses.forEach((response, index) => {
                expect(response.status).toBe(200);
                expect(response.body.query.text).toBe(`Concurrent query ${index}`);
            });
        });

        it('should maintain response time performance', async () => {
            const startTime = Date.now();

            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'Performance test query' })
                .expect(200);

            const endTime = Date.now();
            const responseTime = endTime - startTime;

            // Response should be reasonably fast (under 5 seconds for test)
            expect(responseTime).toBeLessThan(5000);

            // Processing time should be reported in response
            expect(response.body.result.processingTime).toBeGreaterThan(0);
            expect(response.body.metadata.processingTime).toBeGreaterThan(0);
        });
    });

    describe('Response Format Validation', () => {
        it('should format source attribution correctly', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'Test source attribution' })
                .expect(200);

            if (response.body.result.sources.length > 0) {
                const source = response.body.result.sources[0];

                expect(source).toHaveProperty('sourceId');
                expect(source).toHaveProperty('sourceName');
                expect(source).toHaveProperty('contentId');
                expect(source).toHaveProperty('title');
                expect(source).toHaveProperty('excerpt');
                expect(source).toHaveProperty('relevanceScore');

                expect(typeof source.relevanceScore).toBe('number');
                expect(source.relevanceScore).toBeGreaterThanOrEqual(0);
                expect(source.relevanceScore).toBeLessThanOrEqual(1);
            }
        });

        it('should round confidence and relevance scores appropriately', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'Test score rounding' })
                .expect(200);

            // Confidence should be rounded to 3 decimal places
            const confidence = response.body.result.confidence;
            const confidenceStr = confidence.toString();
            const decimalPlaces = confidenceStr.includes('.') ?
                confidenceStr.split('.')[1].length : 0;
            expect(decimalPlaces).toBeLessThanOrEqual(3);

            // Source relevance scores should also be rounded
            response.body.result.sources.forEach((source: any) => {
                const scoreStr = source.relevanceScore.toString();
                const decimalPlaces = scoreStr.includes('.') ?
                    scoreStr.split('.')[1].length : 0;
                expect(decimalPlaces).toBeLessThanOrEqual(3);
            });
        });

        it('should include all required metadata fields', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'Metadata validation test' })
                .expect(200);

            const metadata = response.body.metadata;

            expect(metadata).toHaveProperty('totalSources');
            expect(metadata).toHaveProperty('processingTime');
            expect(metadata).toHaveProperty('timestamp');
            expect(metadata).toHaveProperty('correlationId');
            expect(metadata).toHaveProperty('version');

            expect(typeof metadata.totalSources).toBe('number');
            expect(typeof metadata.processingTime).toBe('number');
            expect(typeof metadata.timestamp).toBe('string');
            expect(typeof metadata.correlationId).toBe('string');
            expect(metadata.version).toBe('1.0.0');
        });
    });
});