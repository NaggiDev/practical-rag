import express from 'express';
import Joi from 'joi';
import request from 'supertest';
import {
    commonSchemas,
    sanitizeRequest,
    validateContentType,
    validateRequestSize,
    validateWithJoi,
    ValidationError
} from '../../../api/middleware/validation';

describe('Validation Middleware', () => {
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

    describe('Joi Validation Middleware', () => {
        const testSchema = Joi.object({
            name: Joi.string().required().min(1).max(50),
            age: Joi.number().integer().min(0).max(150),
            email: Joi.string().email().optional()
        });

        beforeEach(() => {
            app.post('/test', validateWithJoi(testSchema, 'body'), (req, res) => {
                res.json({ message: 'Validation passed', data: req.body });
            });
        });

        it('should pass validation with valid data', async () => {
            const validData = {
                name: 'John Doe',
                age: 30,
                email: 'john@example.com'
            };

            const response = await request(app)
                .post('/test')
                .send(validData)
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Validation passed');
            expect(response.body.data).toEqual(validData);
        });

        it('should fail validation with missing required field', async () => {
            const invalidData = {
                age: 30
                // missing required 'name' field
            };

            const response = await request(app)
                .post('/test')
                .send(invalidData)
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
            expect(response.body.error).toHaveProperty('message', 'body validation failed');
            expect(response.body.error).toHaveProperty('details');
            expect(response.body.error.details).toHaveProperty('errors');
            expect(response.body.error.details.errors).toBeInstanceOf(Array);
        });

        it('should fail validation with invalid data types', async () => {
            const invalidData = {
                name: 'John Doe',
                age: 'not a number',
                email: 'invalid-email'
            };

            const response = await request(app)
                .post('/test')
                .send(invalidData)
                .expect(400);

            expect(response.body.error.details.errors).toHaveLength(2); // age and email errors
        });

        it('should strip unknown fields', async () => {
            const dataWithExtra = {
                name: 'John Doe',
                age: 30,
                unknownField: 'should be removed'
            };

            const response = await request(app)
                .post('/test')
                .send(dataWithExtra)
                .expect(200);

            expect(response.body.data).not.toHaveProperty('unknownField');
            expect(response.body.data).toHaveProperty('name', 'John Doe');
            expect(response.body.data).toHaveProperty('age', 30);
        });
    });

    describe('Common Schemas', () => {
        describe('UUID Schema', () => {
            beforeEach(() => {
                app.get('/test/:id', validateWithJoi(Joi.object({ id: commonSchemas.uuid }), 'params'), (req, res) => {
                    res.json({ id: req.params.id });
                });
            });

            it('should validate valid UUID', async () => {
                const validUuid = '123e4567-e89b-12d3-a456-426614174000';

                const response = await request(app)
                    .get(`/test/${validUuid}`)
                    .expect(200);

                expect(response.body).toHaveProperty('id', validUuid);
            });

            it('should reject invalid UUID', async () => {
                const response = await request(app)
                    .get('/test/invalid-uuid')
                    .expect(400);

                expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
            });
        });

        describe('Pagination Schema', () => {
            beforeEach(() => {
                app.get('/test', validateWithJoi(commonSchemas.pagination, 'query'), (req, res) => {
                    res.json({ pagination: req.query });
                });
            });

            it('should apply default values', async () => {
                const response = await request(app)
                    .get('/test')
                    .expect(200);

                expect(response.body.pagination).toHaveProperty('page', 1);
                expect(response.body.pagination).toHaveProperty('limit', 20);
                expect(response.body.pagination).toHaveProperty('sort', 'desc');
            });

            it('should validate custom pagination values', async () => {
                const response = await request(app)
                    .get('/test?page=2&limit=50&sort=asc&sortBy=name')
                    .expect(200);

                expect(response.body.pagination).toHaveProperty('page', 2);
                expect(response.body.pagination).toHaveProperty('limit', 50);
                expect(response.body.pagination).toHaveProperty('sort', 'asc');
                expect(response.body.pagination).toHaveProperty('sortBy', 'name');
            });

            it('should reject invalid pagination values', async () => {
                const response = await request(app)
                    .get('/test?page=0&limit=1000')
                    .expect(400);

                expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
            });
        });

        describe('Query Request Schema', () => {
            beforeEach(() => {
                app.post('/test', validateWithJoi(commonSchemas.queryRequest, 'body'), (req, res) => {
                    res.json({ query: req.body });
                });
            });

            it('should validate valid query request', async () => {
                const validQuery = {
                    text: 'What is the meaning of life?',
                    context: { source: 'test' },
                    filters: [
                        { field: 'category', operator: 'eq', value: 'philosophy' }
                    ]
                };

                const response = await request(app)
                    .post('/test')
                    .send(validQuery)
                    .expect(200);

                expect(response.body.query).toEqual(validQuery);
            });

            it('should reject empty query text', async () => {
                const response = await request(app)
                    .post('/test')
                    .send({ text: '' })
                    .expect(400);

                expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
            });

            it('should reject query text that is too long', async () => {
                const longText = 'a'.repeat(10001);

                const response = await request(app)
                    .post('/test')
                    .send({ text: longText })
                    .expect(400);

                expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
            });
        });
    });

    describe('Request Sanitization', () => {
        beforeEach(() => {
            app.use(sanitizeRequest);
            app.post('/test', (req, res) => {
                res.json({ body: req.body, query: req.query });
            });
        });

        it('should sanitize string values', async () => {
            const maliciousData = {
                name: '  <script>alert("xss")</script>  ',
                description: 'javascript:alert("xss")',
                event: 'onclick=alert("xss")'
            };

            const response = await request(app)
                .post('/test?search=<script>test</script>')
                .send(maliciousData)
                .expect(200);

            expect(response.body.body.name).toBe('alert("xss")');
            expect(response.body.body.description).toBe('alert("xss")');
            expect(response.body.body.event).toBe('alert("xss")');
            expect(response.body.query.search).toBe('test');
        });

        it('should handle nested objects', async () => {
            const nestedData = {
                user: {
                    name: '  <b>John</b>  ',
                    profile: {
                        bio: 'javascript:void(0)'
                    }
                }
            };

            const response = await request(app)
                .post('/test')
                .send(nestedData)
                .expect(200);

            expect(response.body.body.user.name).toBe('John');
            expect(response.body.body.user.profile.bio).toBe('void(0)');
        });

        it('should handle arrays', async () => {
            const arrayData = {
                tags: ['  <script>  ', 'javascript:alert()', '  normal  ']
            };

            const response = await request(app)
                .post('/test')
                .send(arrayData)
                .expect(200);

            expect(response.body.body.tags).toEqual(['', 'alert()', 'normal']);
        });
    });

    describe('Content-Type Validation', () => {
        beforeEach(() => {
            app.post('/test', validateContentType(['application/json']), (_req, res) => {
                res.json({ message: 'Content-Type valid' });
            });
        });

        it('should accept valid content type', async () => {
            const response = await request(app)
                .post('/test')
                .set('Content-Type', 'application/json')
                .send({ test: 'data' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Content-Type valid');
        });

        it('should reject invalid content type', async () => {
            const response = await request(app)
                .post('/test')
                .set('Content-Type', 'text/plain')
                .send('plain text')
                .expect(415);

            expect(response.body.error).toHaveProperty('code', 'INVALID_CONTENT_TYPE');
        });

        it('should reject missing content type', async () => {
            const response = await request(app)
                .post('/test')
                .send({ test: 'data' })
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'MISSING_CONTENT_TYPE');
        });

        it('should skip validation for GET requests', async () => {
            app.get('/test-get', validateContentType(['application/json']), (_req, res) => {
                res.json({ message: 'GET request' });
            });

            const response = await request(app)
                .get('/test-get')
                .expect(200);

            expect(response.body).toHaveProperty('message', 'GET request');
        });
    });

    describe('Request Size Validation', () => {
        beforeEach(() => {
            app.post('/test', validateRequestSize(100), (_req, res) => {
                res.json({ message: 'Size valid' });
            });
        });

        it('should accept requests within size limit', async () => {
            const response = await request(app)
                .post('/test')
                .send({ small: 'data' })
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Size valid');
        });

        // Note: Testing actual size limit exceeded is tricky with supertest
        // as it handles content-length automatically. In a real scenario,
        // you would test this with actual large payloads.
    });

    describe('ValidationError Class', () => {
        it('should create ValidationError correctly', () => {
            const details = [{ field: 'name', message: 'Required' }];
            const error = new ValidationError('Validation failed', details);

            expect(error.name).toBe('ValidationError');
            expect(error.message).toBe('Validation failed');
            expect(error.details).toEqual(details);
        });
    });
});