import request from 'supertest';
import { ApiGateway } from '../../../api/app';

describe('Query Routes', () => {
    let apiGateway: ApiGateway;
    let app: any;

    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        process.env.SKIP_AUTH = 'true'; // Skip authentication for testing
        apiGateway = new ApiGateway(0);
        app = apiGateway.getApp();
    });

    describe('POST /api/v1/query', () => {
        it('should process a valid query', async () => {
            const queryData = {
                text: 'What is the meaning of life?',
                context: { source: 'test' },
                filters: [
                    { field: 'category', operator: 'eq', value: 'philosophy' }
                ]
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send(queryData)
                .expect(200);

            expect(response.body).toHaveProperty('query');
            expect(response.body).toHaveProperty('result');
            expect(response.body).toHaveProperty('metadata');

            // Validate query structure
            expect(response.body.query).toHaveProperty('id');
            expect(response.body.query).toHaveProperty('text', queryData.text);
            expect(response.body.query).toHaveProperty('context', queryData.context);
            expect(response.body.query).toHaveProperty('filters', queryData.filters);
            expect(response.body.query).toHaveProperty('timestamp');
            expect(response.body.query).toHaveProperty('userId', 'dev-user');

            // Validate result structure
            expect(response.body.result).toHaveProperty('id');
            expect(response.body.result).toHaveProperty('response');
            expect(response.body.result).toHaveProperty('sources');
            expect(response.body.result).toHaveProperty('confidence');
            expect(response.body.result).toHaveProperty('processingTime');
            expect(response.body.result).toHaveProperty('cached', false);

            // Validate metadata
            expect(response.body.metadata).toHaveProperty('processingTime');
            expect(response.body.metadata).toHaveProperty('timestamp');
            expect(response.body.metadata).toHaveProperty('correlationId');

            // Validate data types
            expect(typeof response.body.result.confidence).toBe('number');
            expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
            expect(response.body.result.confidence).toBeLessThanOrEqual(1);
            expect(response.body.result.sources).toBeInstanceOf(Array);
            expect(typeof response.body.result.processingTime).toBe('number');
        });

        it('should handle query without optional fields', async () => {
            const queryData = {
                text: 'Simple query without context or filters'
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send(queryData)
                .expect(200);

            expect(response.body.query).toHaveProperty('text', queryData.text);
            expect(response.body.query.context).toBeUndefined();
            expect(response.body.query.filters).toBeUndefined();
        });

        it('should reject empty query text', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: '' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should reject query text that is too long', async () => {
            const longText = 'a'.repeat(10001);

            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: longText })
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should reject missing query text', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({})
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should validate filter structure', async () => {
            const queryData = {
                text: 'Test query',
                filters: [
                    { field: 'category', operator: 'invalid_operator', value: 'test' }
                ]
            };

            const response = await request(app)
                .post('/api/v1/query')
                .send(queryData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should require valid content type', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .set('Content-Type', 'text/plain')
                .send('plain text query')
                .expect(415);

            expect(response.body.error).toHaveProperty('code', 'INVALID_CONTENT_TYPE');
        });

        it('should include rate limit headers', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'Test query' })
                .expect(200);

            expect(response.headers).toHaveProperty('ratelimit-limit');
            expect(response.headers).toHaveProperty('ratelimit-remaining');
        });

        it('should return different responses based on query content', async () => {
            // Test error-related query
            const errorResponse = await request(app)
                .post('/api/v1/query')
                .send({ text: 'How to fix this error?' })
                .expect(200);

            expect(errorResponse.body.result.response).toContain('common solutions');
            expect(errorResponse.body.result.confidence).toBeGreaterThan(0.8);

            // Test tutorial-related query
            const tutorialResponse = await request(app)
                .post('/api/v1/query')
                .send({ text: 'How to setup the system?' })
                .expect(200);

            expect(tutorialResponse.body.result.response).toContain('step-by-step guide');

            // Test API-related query
            const apiResponse = await request(app)
                .post('/api/v1/query')
                .send({ text: 'What are the available API endpoints?' })
                .expect(200);

            expect(apiResponse.body.result.response).toContain('API endpoints');
            expect(apiResponse.body.result.confidence).toBeGreaterThan(0.9);
        });
    });

    describe('GET /api/v1/query/history', () => {
        it('should return query history with pagination', async () => {
            const response = await request(app)
                .get('/api/v1/query/history')
                .expect(200);

            expect(response.body).toHaveProperty('queries');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body).toHaveProperty('metadata');

            expect(response.body.queries).toBeInstanceOf(Array);
            expect(response.body.pagination).toHaveProperty('page', 1);
            expect(response.body.pagination).toHaveProperty('limit', 20);
            expect(response.body.pagination).toHaveProperty('total', 0);
            expect(response.body.pagination).toHaveProperty('totalPages', 0);

            expect(response.body.metadata).toHaveProperty('userId', 'dev-user');
            expect(response.body.metadata).toHaveProperty('timestamp');
            expect(response.body.metadata).toHaveProperty('correlationId');
        });

        it('should handle custom pagination parameters', async () => {
            const response = await request(app)
                .get('/api/v1/query/history?page=2&limit=50&sort=asc&sortBy=timestamp')
                .expect(200);

            expect(response.body.pagination).toHaveProperty('page', 2);
            expect(response.body.pagination).toHaveProperty('limit', 50);
        });

        it('should validate pagination parameters', async () => {
            const response = await request(app)
                .get('/api/v1/query/history?page=0&limit=1000')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/query/:queryId', () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';

        it('should return 404 for non-existent query', async () => {
            const response = await request(app)
                .get(`/api/v1/query/${validUuid}`)
                .expect(404);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'QUERY_NOT_FOUND');
            expect(response.body.error).toHaveProperty('message', 'Query result not found');
            expect(response.body.error).toHaveProperty('correlationId');
        });

        it('should validate UUID format', async () => {
            const response = await request(app)
                .get('/api/v1/query/invalid-uuid')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('DELETE /api/v1/query/:queryId', () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';

        it('should return 404 for non-existent query cancellation', async () => {
            const response = await request(app)
                .delete(`/api/v1/query/${validUuid}`)
                .expect(404);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'QUERY_NOT_FOUND');
            expect(response.body.error).toHaveProperty('message', 'Query not found or cannot be cancelled');
        });

        it('should validate UUID format for cancellation', async () => {
            const response = await request(app)
                .delete('/api/v1/query/invalid-uuid')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
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

            expect(response.body.suggestions).toBeInstanceOf(Array);
            expect(response.body.suggestions.length).toBeLessThanOrEqual(3);

            expect(response.body.metadata).toHaveProperty('queryText', 'how to');
            expect(response.body.metadata).toHaveProperty('limit', 3);
            expect(response.body.metadata).toHaveProperty('timestamp');
            expect(response.body.metadata).toHaveProperty('correlationId');
        });

        it('should filter suggestions based on query text', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .query({ q: 'api' })
                .expect(200);

            expect(response.body.suggestions).toBeInstanceOf(Array);
            // Should include suggestions related to 'api'
            const hasApiSuggestion = response.body.suggestions.some((s: string) =>
                s.toLowerCase().includes('api')
            );
            expect(hasApiSuggestion).toBe(true);
        });

        it('should require query text parameter', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should handle empty query text', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions?q=')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should use default limit when not specified', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .query({ q: 'test' })
                .expect(200);

            expect(response.body.suggestions.length).toBeLessThanOrEqual(5); // Default limit
            expect(response.body.metadata).toHaveProperty('limit', 5);
        });

        it('should handle non-numeric limit parameter', async () => {
            const response = await request(app)
                .get('/api/v1/query/suggestions')
                .query({ q: 'test', limit: 'invalid' })
                .expect(400); // Should return validation error for invalid limit

            // Should return validation error
            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('Authentication Integration', () => {
        beforeAll(() => {
            // Re-enable authentication for these tests
            delete process.env.SKIP_AUTH;
        });

        afterAll(() => {
            // Restore skip auth for other tests
            process.env.SKIP_AUTH = 'true';
        });

        it('should require authentication for query endpoints', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'Test query' })
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('message', 'No authentication token provided');
        });

        it('should work with valid API key', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .set('Authorization', 'Bearer dev-user-key-67890')
                .send({ text: 'Test query' })
                .expect(200);

            expect(response.body.query).toHaveProperty('userId', 'regular-user');
        });
    });

    describe('Performance', () => {
        it('should respond to queries within reasonable time', async () => {
            const startTime = Date.now();

            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'Performance test query' })
                .expect(200);

            const totalTime = Date.now() - startTime;
            expect(totalTime).toBeLessThan(2000); // Should respond within 2 seconds

            // Processing time should be included in response
            expect(response.body.result.processingTime).toBeLessThan(1000);
            expect(response.body.metadata.processingTime).toBeLessThan(1000);
        });
    });
});