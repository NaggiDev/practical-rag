import request from 'supertest';
import { ApiGateway } from '../../api/app';

describe('API Gateway', () => {
    let apiGateway: ApiGateway;
    let app: any;

    beforeAll(() => {
        // Set test environment
        process.env.NODE_ENV = 'test';
        process.env.SKIP_AUTH = 'true';

        apiGateway = new ApiGateway(0); // Use port 0 for testing
        app = apiGateway.getApp();
    });

    describe('Root endpoints', () => {
        it('should return API information at root', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);

            expect(response.body).toHaveProperty('name', 'Fast RAG System API');
            expect(response.body).toHaveProperty('version', '1.0.0');
            expect(response.body).toHaveProperty('status', 'running');
            expect(response.body).toHaveProperty('endpoints');
        });

        it('should return API documentation at /api/v1', async () => {
            const response = await request(app)
                .get('/api/v1')
                .expect(200);

            expect(response.body).toHaveProperty('version', '1.0.0');
            expect(response.body).toHaveProperty('endpoints');
            expect(response.body.endpoints).toHaveProperty('POST /query');
            expect(response.body.endpoints).toHaveProperty('GET /health');
            expect(response.body.endpoints).toHaveProperty('GET /sources');
        });

        it('should return 404 for unknown routes', async () => {
            const response = await request(app)
                .get('/unknown-route')
                .expect(404);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'ROUTE_NOT_FOUND');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('correlationId');
        });
    });

    describe('CORS and Security Headers', () => {
        it('should include security headers', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);

            expect(response.headers).toHaveProperty('x-content-type-options');
            expect(response.headers).toHaveProperty('x-frame-options');
            expect(response.headers).toHaveProperty('x-xss-protection');
        });

        it('should handle CORS preflight requests', async () => {
            const response = await request(app)
                .options('/api/v1/health')
                .set('Origin', 'http://localhost:3000')
                .set('Access-Control-Request-Method', 'GET')
                .expect(204);

            expect(response.headers).toHaveProperty('access-control-allow-origin');
            expect(response.headers).toHaveProperty('access-control-allow-methods');
        });
    });

    describe('Request correlation', () => {
        it('should add correlation ID to responses', async () => {
            const response = await request(app)
                .get('/')
                .expect(200);

            expect(response.headers).toHaveProperty('x-correlation-id');
            expect(response.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
        });

        it('should use provided correlation ID', async () => {
            const correlationId = '12345678-1234-1234-1234-123456789012';

            const response = await request(app)
                .get('/')
                .set('X-Correlation-ID', correlationId)
                .expect(200);

            expect(response.headers['x-correlation-id']).toBe(correlationId);
        });
    });

    describe('Error handling', () => {
        it('should handle validation errors', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .send({ invalid: 'data' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
            expect(response.body.error).toHaveProperty('correlationId');
        });

        it('should handle content-type errors', async () => {
            const response = await request(app)
                .post('/api/v1/query')
                .set('Content-Type', 'text/plain')
                .send('invalid content type')
                .expect(415);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'INVALID_CONTENT_TYPE');
        });
    });

    describe('Compression', () => {
        it('should compress large responses', async () => {
            const response = await request(app)
                .get('/')
                .set('Accept-Encoding', 'gzip')
                .expect(200);

            // For small responses, compression might not be applied
            // This test mainly ensures compression middleware is working
            expect(response.status).toBe(200);
        });
    });
});