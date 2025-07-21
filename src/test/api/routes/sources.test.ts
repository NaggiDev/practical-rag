import request from 'supertest';
import { ApiGateway } from '../../../api/app';

describe('Sources Routes', () => {
    let apiGateway: ApiGateway;
    let app: any;

    beforeAll(() => {
        process.env.NODE_ENV = 'test';
        process.env.SKIP_AUTH = 'true'; // Skip authentication for testing
        apiGateway = new ApiGateway(0);
        app = apiGateway.getApp();
    });

    describe('GET /api/v1/sources', () => {
        it('should return list of data sources with pagination', async () => {
            const response = await request(app)
                .get('/api/v1/sources')
                .expect(200);

            expect(response.body).toHaveProperty('sources');
            expect(response.body).toHaveProperty('pagination');
            expect(response.body).toHaveProperty('metadata');

            expect(response.body.sources).toBeInstanceOf(Array);
            expect(response.body.pagination).toHaveProperty('page', 1);
            expect(response.body.pagination).toHaveProperty('limit', 20);
            expect(response.body.pagination).toHaveProperty('total');
            expect(response.body.pagination).toHaveProperty('totalPages');

            expect(response.body.metadata).toHaveProperty('timestamp');
            expect(response.body.metadata).toHaveProperty('correlationId');
        });

        it('should handle custom pagination parameters', async () => {
            const response = await request(app)
                .get('/api/v1/sources?page=2&limit=50&sort=asc&sortBy=name')
                .expect(200);

            expect(response.body.pagination).toHaveProperty('page', 2);
            expect(response.body.pagination).toHaveProperty('limit', 50);
        });

        it('should validate pagination parameters', async () => {
            const response = await request(app)
                .get('/api/v1/sources?page=0&limit=1000')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should include rate limit headers', async () => {
            const response = await request(app)
                .get('/api/v1/sources')
                .expect(200);

            expect(response.headers).toHaveProperty('ratelimit-limit');
            expect(response.headers).toHaveProperty('ratelimit-remaining');
        });
    });

    describe('POST /api/v1/sources', () => {
        it('should create a file data source', async () => {
            const sourceData = {
                name: 'Test File Source',
                type: 'file',
                config: {
                    filePath: '/path/to/documents',
                    fileTypes: ['pdf', 'txt', 'md'],
                    watchForChanges: true,
                    recursive: false
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            expect(response.body).toHaveProperty('source');
            expect(response.body).toHaveProperty('metadata');

            expect(response.body.source).toHaveProperty('id');
            expect(response.body.source).toHaveProperty('name', sourceData.name);
            expect(response.body.source).toHaveProperty('type', sourceData.type);
            expect(response.body.source).toHaveProperty('config');
            expect(response.body.source).toHaveProperty('status', 'active');
            expect(response.body.source).toHaveProperty('lastSync');
            expect(response.body.source).toHaveProperty('documentCount', 0);

            expect(response.body.metadata).toHaveProperty('timestamp');
            expect(response.body.metadata).toHaveProperty('correlationId');
            expect(response.body.metadata).toHaveProperty('createdBy', 'dev-user');
        });

        it('should create a database data source', async () => {
            const sourceData = {
                name: 'Test Database Source',
                type: 'database',
                config: {
                    connectionString: 'postgresql://user:pass@localhost:5432/db',
                    table: 'documents',
                    credentials: {
                        username: 'dbuser',
                        password: 'dbpass'
                    },
                    syncInterval: 3600
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            expect(response.body.source).toHaveProperty('type', 'database');
            expect(response.body.source.config).toHaveProperty('connectionString');
            expect(response.body.source.config).toHaveProperty('table', 'documents');
        });

        it('should create an API data source', async () => {
            const sourceData = {
                name: 'Test API Source',
                type: 'api',
                config: {
                    apiEndpoint: 'https://api.example.com/documents',
                    method: 'GET',
                    credentials: {
                        apiKey: 'test-api-key'
                    },
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    pagination: {
                        type: 'offset',
                        limitParam: 'limit',
                        offsetParam: 'offset'
                    }
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            expect(response.body.source).toHaveProperty('type', 'api');
            expect(response.body.source.config).toHaveProperty('apiEndpoint');
            expect(response.body.source.config).toHaveProperty('method', 'GET');
        });

        it('should reject invalid data source type', async () => {
            const sourceData = {
                name: 'Invalid Source',
                type: 'invalid_type',
                config: {}
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should validate file source configuration', async () => {
            const sourceData = {
                name: 'Invalid File Source',
                type: 'file',
                config: {
                    // Missing required filePath
                    fileTypes: ['pdf']
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should validate database source configuration', async () => {
            const sourceData = {
                name: 'Invalid Database Source',
                type: 'database',
                config: {
                    connectionString: 'invalid-connection-string',
                    // Missing required credentials
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should validate API source configuration', async () => {
            const sourceData = {
                name: 'Invalid API Source',
                type: 'api',
                config: {
                    apiEndpoint: 'not-a-valid-url',
                    // Missing required credentials
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should require valid content type', async () => {
            const response = await request(app)
                .post('/api/v1/sources')
                .set('Content-Type', 'text/plain')
                .send('invalid content')
                .expect(415);

            expect(response.body.error).toHaveProperty('code', 'INVALID_CONTENT_TYPE');
        });

        it('should require name field', async () => {
            const sourceData = {
                type: 'file',
                config: {
                    filePath: '/path/to/documents'
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/sources/:sourceId', () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        let createdSourceId: string;

        beforeAll(async () => {
            // Create a test source for retrieval tests
            const sourceData = {
                name: 'Test Retrieval Source',
                type: 'file',
                config: {
                    filePath: '/test/path'
                }
            };

            const createResponse = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            createdSourceId = createResponse.body.source.id;
        });

        it('should return source details for existing source', async () => {
            const response = await request(app)
                .get(`/api/v1/sources/${createdSourceId}`)
                .expect(200);

            expect(response.body).toHaveProperty('source');
            expect(response.body).toHaveProperty('metadata');
            expect(response.body.source).toHaveProperty('id', createdSourceId);
            expect(response.body.source).toHaveProperty('name', 'Test Retrieval Source');
            expect(response.body.source).toHaveProperty('type', 'file');
        });

        it('should return 404 for non-existent source', async () => {
            const response = await request(app)
                .get(`/api/v1/sources/${validUuid}`)
                .expect(404);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code', 'SOURCE_NOT_FOUND');
            expect(response.body.error).toHaveProperty('message', 'Data source not found');
            expect(response.body.error).toHaveProperty('correlationId');
        });

        it('should validate UUID format', async () => {
            const response = await request(app)
                .get('/api/v1/sources/invalid-uuid')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('PUT /api/v1/sources/:sourceId', () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        let createdSourceId: string;

        beforeAll(async () => {
            // Create a test source for update tests
            const sourceData = {
                name: 'Test Update Source',
                type: 'file',
                config: {
                    filePath: '/test/update'
                }
            };

            const createResponse = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            createdSourceId = createResponse.body.source.id;
        });

        it('should update existing source', async () => {
            const updateData = {
                name: 'Updated Source Name',
                type: 'file',
                config: {
                    filePath: '/updated/path',
                    fileTypes: ['pdf', 'txt']
                }
            };

            const response = await request(app)
                .put(`/api/v1/sources/${createdSourceId}`)
                .send(updateData)
                .expect(200);

            expect(response.body).toHaveProperty('source');
            expect(response.body).toHaveProperty('metadata');
            expect(response.body.source).toHaveProperty('id', createdSourceId);
            expect(response.body.source).toHaveProperty('name', 'Updated Source Name');
            expect(response.body.source.config).toHaveProperty('filePath', '/updated/path');
            expect(response.body.metadata).toHaveProperty('updatedBy', 'dev-user');
        });

        it('should return 404 for non-existent source update', async () => {
            const updateData = {
                name: 'Updated Source',
                type: 'file',
                config: {
                    filePath: '/updated/path'
                }
            };

            const response = await request(app)
                .put(`/api/v1/sources/${validUuid}`)
                .send(updateData)
                .expect(404);

            expect(response.body.error).toHaveProperty('code', 'SOURCE_NOT_FOUND');
        });

        it('should validate UUID format for update', async () => {
            const response = await request(app)
                .put('/api/v1/sources/invalid-uuid')
                .send({ name: 'Test', type: 'file', config: { filePath: '/test' } })
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should validate update data', async () => {
            const response = await request(app)
                .put(`/api/v1/sources/${validUuid}`)
                .send({ invalid: 'data' })
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should require valid content type for update', async () => {
            const response = await request(app)
                .put(`/api/v1/sources/${validUuid}`)
                .set('Content-Type', 'text/plain')
                .send('invalid content')
                .expect(415);

            expect(response.body.error).toHaveProperty('code', 'INVALID_CONTENT_TYPE');
        });
    });

    describe('DELETE /api/v1/sources/:sourceId', () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        let createdSourceId: string;

        beforeAll(async () => {
            // Create a test source for deletion tests
            const sourceData = {
                name: 'Test Delete Source',
                type: 'file',
                config: {
                    filePath: '/test/delete'
                }
            };

            const createResponse = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            createdSourceId = createResponse.body.source.id;
        });

        it('should delete existing source', async () => {
            const response = await request(app)
                .delete(`/api/v1/sources/${createdSourceId}`)
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Data source deleted successfully');
            expect(response.body).toHaveProperty('sourceId', createdSourceId);
            expect(response.body).toHaveProperty('metadata');
            expect(response.body.metadata).toHaveProperty('deletedBy', 'dev-user');

            // Verify source is actually deleted
            await request(app)
                .get(`/api/v1/sources/${createdSourceId}`)
                .expect(404);
        });

        it('should return 404 for non-existent source deletion', async () => {
            const response = await request(app)
                .delete(`/api/v1/sources/${validUuid}`)
                .expect(404);

            expect(response.body.error).toHaveProperty('code', 'SOURCE_NOT_FOUND');
        });

        it('should validate UUID format for deletion', async () => {
            const response = await request(app)
                .delete('/api/v1/sources/invalid-uuid')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('POST /api/v1/sources/:sourceId/sync', () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        let createdSourceId: string;

        beforeAll(async () => {
            // Create a test source for sync tests
            const sourceData = {
                name: 'Test Sync Source',
                type: 'file',
                config: {
                    filePath: '/test/sync'
                }
            };

            const createResponse = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            createdSourceId = createResponse.body.source.id;
        });

        it('should trigger sync for active source', async () => {
            const response = await request(app)
                .post(`/api/v1/sources/${createdSourceId}/sync`)
                .expect(200);

            expect(response.body).toHaveProperty('message', 'Sync triggered successfully');
            expect(response.body).toHaveProperty('sourceId', createdSourceId);
            expect(response.body).toHaveProperty('syncId');
            expect(response.body).toHaveProperty('estimatedDuration');
            expect(response.body).toHaveProperty('status');
            expect(response.body).toHaveProperty('metadata');

            expect(response.body.metadata).toHaveProperty('triggeredBy', 'dev-user');
        });

        it('should return 404 for non-existent source sync', async () => {
            const response = await request(app)
                .post(`/api/v1/sources/${validUuid}/sync`)
                .expect(404);

            expect(response.body.error).toHaveProperty('code', 'SOURCE_NOT_FOUND');
        });

        it('should validate UUID format for sync', async () => {
            const response = await request(app)
                .post('/api/v1/sources/invalid-uuid/sync')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('GET /api/v1/sources/:sourceId/health', () => {
        const validUuid = '123e4567-e89b-12d3-a456-426614174000';
        let createdSourceId: string;

        beforeAll(async () => {
            // Create a test source for health check tests
            const sourceData = {
                name: 'Test Health Source',
                type: 'file',
                config: {
                    filePath: '/test/health'
                }
            };

            const createResponse = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(201);

            createdSourceId = createResponse.body.source.id;
        });

        it('should return health status for existing source', async () => {
            const response = await request(app)
                .get(`/api/v1/sources/${createdSourceId}/health`)
                .expect(200);

            expect(response.body).toHaveProperty('sourceId', createdSourceId);
            expect(response.body).toHaveProperty('health');
            expect(response.body).toHaveProperty('metadata');

            expect(response.body.health).toHaveProperty('sourceId', createdSourceId);
            expect(response.body.health).toHaveProperty('isHealthy');
            expect(response.body.health).toHaveProperty('lastCheck');
            expect(response.body.health).toHaveProperty('errorCount');
        });

        it('should return 404 for non-existent source health check', async () => {
            const response = await request(app)
                .get(`/api/v1/sources/${validUuid}/health`)
                .expect(404);

            expect(response.body.error).toHaveProperty('code', 'SOURCE_NOT_FOUND');
        });

        it('should validate UUID format for health check', async () => {
            const response = await request(app)
                .get('/api/v1/sources/invalid-uuid/health')
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('POST /api/v1/sources/validate', () => {
        it('should validate file data source configuration', async () => {
            const sourceData = {
                name: 'Test Validation Source',
                type: 'file',
                config: {
                    filePath: '/valid/path',
                    fileTypes: ['pdf', 'txt']
                }
            };

            const response = await request(app)
                .post('/api/v1/sources/validate')
                .send(sourceData)
                .expect(200);

            expect(response.body).toHaveProperty('valid', true);
            expect(response.body).toHaveProperty('message');
            expect(response.body).toHaveProperty('validatedConfig');
            expect(response.body).toHaveProperty('metadata');

            expect(response.body.validatedConfig).toHaveProperty('name', sourceData.name);
            expect(response.body.validatedConfig).toHaveProperty('type', sourceData.type);
            expect(response.body.validatedConfig).toHaveProperty('config');
        });

        it('should validate database data source configuration', async () => {
            const sourceData = {
                name: 'Test DB Validation',
                type: 'database',
                config: {
                    connectionString: 'postgresql://user:pass@localhost:5432/db',
                    table: 'documents',
                    credentials: {
                        username: 'dbuser',
                        password: 'dbpass'
                    }
                }
            };

            const response = await request(app)
                .post('/api/v1/sources/validate')
                .send(sourceData)
                .expect(200);

            expect(response.body).toHaveProperty('valid', true);
            expect(response.body.validatedConfig.type).toBe('database');
        });

        it('should validate API data source configuration', async () => {
            const sourceData = {
                name: 'Test API Validation',
                type: 'api',
                config: {
                    apiEndpoint: 'https://api.example.com/data',
                    credentials: {
                        apiKey: 'test-key'
                    }
                }
            };

            const response = await request(app)
                .post('/api/v1/sources/validate')
                .send(sourceData)
                .expect(200);

            expect(response.body).toHaveProperty('valid', true);
            expect(response.body.validatedConfig.type).toBe('api');
        });

        it('should reject invalid file configuration', async () => {
            const sourceData = {
                name: 'Invalid File Source',
                type: 'file',
                config: {
                    // Missing required filePath
                    fileTypes: ['pdf']
                }
            };

            const response = await request(app)
                .post('/api/v1/sources/validate')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should reject invalid database configuration', async () => {
            const sourceData = {
                name: 'Invalid DB Source',
                type: 'database',
                config: {
                    connectionString: 'invalid-format',
                    // Missing credentials
                }
            };

            const response = await request(app)
                .post('/api/v1/sources/validate')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should require authentication for validation', async () => {
            // Temporarily disable auth skip
            delete process.env.SKIP_AUTH;

            const response = await request(app)
                .post('/api/v1/sources/validate')
                .send({
                    name: 'Test',
                    type: 'file',
                    config: { filePath: '/test' }
                })
                .expect(401);

            expect(response.body.error).toHaveProperty('message', 'No authentication token provided');

            // Restore auth skip
            process.env.SKIP_AUTH = 'true';
        });
    });

    describe('Authentication and Authorization', () => {
        beforeAll(() => {
            // Re-enable authentication for these tests
            delete process.env.SKIP_AUTH;
        });

        afterAll(() => {
            // Restore skip auth for other tests
            process.env.SKIP_AUTH = 'true';
        });

        it('should require authentication for source management', async () => {
            const response = await request(app)
                .post('/api/v1/sources')
                .send({
                    name: 'Test Source',
                    type: 'file',
                    config: { filePath: '/test' }
                })
                .expect(401);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('message', 'No authentication token provided');
        });

        it('should work with valid API key', async () => {
            const response = await request(app)
                .get('/api/v1/sources')
                .set('Authorization', 'Bearer dev-user-key-67890')
                .expect(200);

            expect(response.body).toHaveProperty('sources');
        });

        it('should require user role for source creation', async () => {
            const sourceData = {
                name: 'Test Source',
                type: 'file',
                config: { filePath: '/test' }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .set('Authorization', 'Bearer dev-readonly-key-11111')
                .send(sourceData)
                .expect(403);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('message', "Role 'user' required");
        });

        it('should allow admin to create sources', async () => {
            const sourceData = {
                name: 'Admin Test Source',
                type: 'file',
                config: { filePath: '/admin/test' }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .set('Authorization', 'Bearer dev-admin-key-12345')
                .send(sourceData)
                .expect(201);

            expect(response.body.source).toHaveProperty('name', 'Admin Test Source');
            expect(response.body.metadata).toHaveProperty('createdBy', 'admin-user');
        });
    });

    describe('Data Source Configuration Validation', () => {
        it('should validate file type restrictions', async () => {
            const sourceData = {
                name: 'File Type Test',
                type: 'file',
                config: {
                    filePath: '/path/to/document.xyz', // Invalid extension
                    fileTypes: ['pdf', 'txt'] // Restricted types
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should validate database connection string format', async () => {
            const sourceData = {
                name: 'Database Test',
                type: 'database',
                config: {
                    connectionString: 'invalid-format', // Should include protocol
                    credentials: {
                        username: 'user',
                        password: 'pass'
                    }
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });

        it('should validate API pagination configuration', async () => {
            const sourceData = {
                name: 'API Pagination Test',
                type: 'api',
                config: {
                    apiEndpoint: 'https://api.example.com/data',
                    credentials: { apiKey: 'test-key' },
                    pagination: {
                        type: 'cursor',
                        // Missing required cursorParam for cursor pagination
                    }
                }
            };

            const response = await request(app)
                .post('/api/v1/sources')
                .send(sourceData)
                .expect(400);

            expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
        });
    });

    describe('Error Response Format', () => {
        it('should return consistent error format', async () => {
            const response = await request(app)
                .post('/api/v1/sources')
                .send({ invalid: 'data' })
                .expect(400);

            expect(response.body).toHaveProperty('error');
            expect(response.body.error).toHaveProperty('code');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error).toHaveProperty('timestamp');
            expect(response.body.error).toHaveProperty('correlationId');
            expect(response.body.error).toHaveProperty('details');
        });
    });
});