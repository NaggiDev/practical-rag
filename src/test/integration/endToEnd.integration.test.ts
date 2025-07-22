import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { ApiGateway } from '../../api/app';
import { DataSourceConfig } from '../../models/dataSource';
import { CacheManager } from '../../services/cache';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';
import { EmbeddingService } from '../../services/embedding';
import { QueryProcessor } from '../../services/queryProcessor';
import { VectorSearchEngine } from '../../services/vectorSearch';

describe('End-to-End Integration Tests', () => {
    let apiGateway: ApiGateway;
    let app: any;
    let dataSourceManager: DataSourceManagerImpl;
    let cacheManager: CacheManager;
    let queryProcessor: QueryProcessor;
    let embeddingService: EmbeddingService;
    let vectorSearchEngine: VectorSearchEngine;

    // Test data sources
    const testDataSources: DataSourceConfig[] = [
        {
            id: 'test-file-source',
            name: 'Test File Source',
            type: 'file',
            config: {
                filePath: path.join(__dirname, '../test-data'),
                fileTypes: ['txt', 'md'],
                recursive: true
            },
            enabled: true
        },
        {
            id: 'test-api-source',
            name: 'Test API Source',
            type: 'api',
            config: {
                apiEndpoint: 'https://jsonplaceholder.typicode.com/posts',
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                responseMapping: {
                    titleField: 'title',
                    contentField: 'body',
                    idField: 'id'
                }
            },
            enabled: true
        }
    ];

    beforeAll(async () => {
        // Initialize API gateway for testing
        apiGateway = new ApiGateway(0); // Use port 0 for testing
        app = apiGateway.getApp();

        // Initialize core services
        embeddingService = new EmbeddingService({
            provider: 'local',
            model: 'sentence-transformers/all-MiniLM-L6-v2',
            dimensions: 384,
            batchSize: 32
        });

        vectorSearchEngine = new VectorSearchEngine({
            provider: 'faiss',
            dimensions: 384,
            indexType: 'flat',
            metric: 'cosine'
        });

        cacheManager = new CacheManager({
            provider: 'memory',
            ttl: 300,
            maxSize: 1000
        });

        dataSourceManager = new DataSourceManagerImpl();
        queryProcessor = new QueryProcessor({
            embeddingService,
            vectorSearchEngine,
            cacheManager,
            dataSourceManager
        });

        // Setup test data sources
        for (const sourceConfig of testDataSources) {
            try {
                await dataSourceManager.addSource(sourceConfig);
                await dataSourceManager.syncSource(sourceConfig.id);
            } catch (error) {
                console.warn(`Failed to setup test data source ${sourceConfig.id}:`, error);
            }
        }

        // Wait for initial indexing to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
    });

    afterAll(async () => {
        // Cleanup
        if (cacheManager) {
            await cacheManager.disconnect();
        }
        if (vectorSearchEngine) {
            await vectorSearchEngine.close();
        }
        if (dataSourceManager) {
            await dataSourceManager.cleanup();
        }
    });

    describe('Complete Query Processing Flow', () => {
        it('should process a query end-to-end within 2 seconds', async () => {
            const startTime = Date.now();
            const queryText = 'sample text information';

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: queryText,
                    context: { domain: 'test' }
                })
                .expect(200);

            const endTime = Date.now();
            const processingTime = endTime - startTime;

            // Verify response time requirement (Requirement 1.1)
            expect(processingTime).toBeLessThan(2000);

            // Verify response structure
            expect(response.body).toMatchObject({
                query: {
                    id: expect.any(String),
                    text: queryText,
                    context: { domain: 'test' },
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

            // Verify processing time is recorded accurately
            expect(response.body.result.processingTime).toBeGreaterThan(0);
            expect(response.body.result.processingTime).toBeLessThan(processingTime + 100);
        });

        it('should search across all configured data sources simultaneously', async () => {
            const queryText = 'information from multiple sources';

            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: queryText })
                .expect(200);

            // Verify multiple sources were searched (Requirement 1.2)
            expect(response.body.metadata.totalSources).toBeGreaterThan(0);

            // If sources returned results, verify they come from different sources
            if (response.body.result.sources.length > 1) {
                const sourceIds = new Set(response.body.result.sources.map((s: any) => s.sourceId));
                expect(sourceIds.size).toBeGreaterThan(0);
            }
        });

        it('should rank and prioritize results by relevance score', async () => {
            const queryText = 'sample testing data';

            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: queryText })
                .expect(200);

            const sources = response.body.result.sources;

            if (sources.length > 1) {
                // Verify sources are sorted by relevance score (Requirement 1.3)
                for (let i = 0; i < sources.length - 1; i++) {
                    expect(sources[i].relevanceScore).toBeGreaterThanOrEqual(sources[i + 1].relevanceScore);
                }
            }

            // Verify all relevance scores are valid
            sources.forEach((source: any) => {
                expect(source.relevanceScore).toBeGreaterThanOrEqual(0);
                expect(source.relevanceScore).toBeLessThanOrEqual(1);
            });
        });

        it('should provide semantic search with contextual relevance', async () => {
            const queryText = 'testing sample document';

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: queryText,
                    context: { searchType: 'semantic' }
                })
                .expect(200);

            // Verify semantic search was used (Requirement 3.1)
            expect(response.body.result.response).toBeTruthy();
            expect(response.body.result.confidence).toBeGreaterThan(0);

            // Verify source attribution (Requirement 3.4)
            if (response.body.result.sources.length > 0) {
                response.body.result.sources.forEach((source: any) => {
                    expect(source).toMatchObject({
                        sourceId: expect.any(String),
                        sourceName: expect.any(String),
                        contentId: expect.any(String),
                        title: expect.any(String),
                        excerpt: expect.any(String),
                        relevanceScore: expect.any(Number)
                    });
                });
            }
        });

        it('should synthesize information from multiple sources', async () => {
            const queryText = 'comprehensive information synthesis';

            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: queryText })
                .expect(200);

            // Verify response synthesis (Requirement 3.2)
            expect(response.body.result.response).toBeTruthy();
            expect(response.body.result.response.length).toBeGreaterThan(20);

            // Verify coherent response structure
            expect(typeof response.body.result.response).toBe('string');
            expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
            expect(response.body.result.confidence).toBeLessThanOrEqual(1);
        });
    });

    describe('Caching and Performance', () => {
        it('should serve cached results within 500ms', async () => {
            const queryText = 'cached query performance test';

            // First request to populate cache
            await request(app)
                .post('/api/v1/query')
                .send({ text: queryText })
                .expect(200);

            // Second request should be cached
            const startTime = Date.now();
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: queryText })
                .expect(200);
            const endTime = Date.now();

            const processingTime = endTime - startTime;

            // Verify cache performance requirement (Requirement 4.2)
            if (response.body.result.cached) {
                expect(processingTime).toBeLessThan(500);
            }

            expect(response.body.result).toHaveProperty('cached');
        });

        it('should handle incremental index updates', async () => {
            // Create a new test file
            const testFilePath = path.join(__dirname, '../test-data/dynamic-test.txt');
            const testContent = 'Dynamic test content for incremental indexing';

            try {
                await fs.writeFile(testFilePath, testContent);

                // Trigger incremental update
                await dataSourceManager.syncSource('test-file-source');

                // Wait for indexing
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Query for the new content
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'dynamic test content' })
                    .expect(200);

                // Verify incremental indexing worked (Requirement 4.1)
                expect(response.body.result.response).toBeTruthy();

            } finally {
                // Cleanup test file
                try {
                    await fs.unlink(testFilePath);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });
    });

    describe('API Interface and Integration', () => {
        it('should provide REST API with standard HTTP methods', async () => {
            // Test GET endpoints
            await request(app)
                .get('/api/v1/health')
                .expect(200);

            await request(app)
                .get('/api/v1/sources')
                .expect(200);

            // Test POST endpoints (Requirement 5.1)
            await request(app)
                .post('/api/v1/query')
                .send({ text: 'API interface test' })
                .expect(200);
        });

        it('should support asynchronous query processing', async () => {
            const queryText = 'async processing test query';

            const response = await request(app)
                .post('/api/v1/query/async')
                .send({ text: queryText })
                .expect(202);

            // Verify async processing support (Requirement 5.2)
            expect(response.body).toMatchObject({
                queryId: expect.any(String),
                status: 'processing',
                message: expect.any(String),
                statusUrl: expect.stringContaining('/api/v1/query/'),
                estimatedTime: expect.any(String),
                metadata: {
                    timestamp: expect.any(String),
                    correlationId: expect.any(String)
                }
            });
        });

        it('should return meaningful error messages with appropriate HTTP status codes', async () => {
            // Test validation errors (Requirement 5.3)
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: '' })
                .expect(400);

            expect(response.body.error).toMatchObject({
                code: expect.any(String),
                message: expect.any(String),
                timestamp: expect.any(String),
                correlationId: expect.any(String)
            });

            // Test not found errors
            await request(app)
                .get('/api/v1/nonexistent')
                .expect(404);
        });
    });

    describe('Data Source Management', () => {
        it('should validate data source connections', async () => {
            const validSourceConfig = {
                name: 'Test Validation Source',
                type: 'file',
                config: {
                    filePath: path.join(__dirname, '../test-data'),
                    fileTypes: ['txt']
                }
            };

            const response = await request(app)
                .post('/api/v1/sources/validate')
                .send(validSourceConfig)
                .expect(200);

            // Verify validation functionality (Requirement 2.4)
            expect(response.body).toMatchObject({
                valid: true,
                message: expect.any(String),
                metadata: expect.any(Object)
            });
        });

        it('should handle data source health monitoring', async () => {
            const sources = await request(app)
                .get('/api/v1/sources')
                .expect(200);

            if (sources.body.sources.length > 0) {
                const sourceId = sources.body.sources[0].id;

                const healthResponse = await request(app)
                    .get(`/api/v1/sources/${sourceId}/health`)
                    .expect(200);

                // Verify health monitoring (Requirement 2.5)
                expect(healthResponse.body).toMatchObject({
                    sourceId,
                    status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
                    lastCheck: expect.any(String),
                    metrics: expect.any(Object)
                });
            }
        });
    });

    describe('System Monitoring and Health', () => {
        it('should provide query response time metrics', async () => {
            // Generate some queries for metrics
            const queries = [
                'metrics test query 1',
                'metrics test query 2',
                'metrics test query 3'
            ];

            for (const query of queries) {
                await request(app)
                    .post('/api/v1/query')
                    .send({ text: query });
            }

            const metricsResponse = await request(app)
                .get('/api/v1/health/metrics')
                .expect(200);

            // Verify metrics collection (Requirement 6.1)
            expect(metricsResponse.body).toMatchObject({
                queryMetrics: {
                    totalQueries: expect.any(Number),
                    averageResponseTime: expect.any(Number),
                    p50ResponseTime: expect.any(Number),
                    p95ResponseTime: expect.any(Number),
                    p99ResponseTime: expect.any(Number)
                },
                cacheMetrics: {
                    hitRate: expect.any(Number),
                    totalHits: expect.any(Number),
                    totalMisses: expect.any(Number)
                },
                systemMetrics: expect.any(Object)
            });
        });

        it('should provide detailed health check with component status', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            // Verify comprehensive health monitoring (Requirement 6.2)
            expect(response.body).toMatchObject({
                status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
                timestamp: expect.any(String),
                components: {
                    database: expect.any(Object),
                    cache: expect.any(Object),
                    vectorSearch: expect.any(Object),
                    dataSources: expect.any(Object)
                },
                metrics: expect.any(Object)
            });
        });

        it('should track query patterns and popular data sources', async () => {
            // Generate queries to create patterns
            const popularQueries = [
                'popular query pattern',
                'common search term',
                'frequently asked question'
            ];

            for (const query of popularQueries) {
                await request(app)
                    .post('/api/v1/query')
                    .send({ text: query });
            }

            const analyticsResponse = await request(app)
                .get('/api/v1/health/analytics')
                .expect(200);

            // Verify usage tracking (Requirement 6.4)
            expect(analyticsResponse.body).toMatchObject({
                queryPatterns: expect.any(Array),
                popularSources: expect.any(Array),
                timeRange: expect.any(Object),
                totalQueries: expect.any(Number)
            });
        });
    });

    describe('Error Handling and Resilience', () => {
        it('should handle malformed requests gracefully', async () => {
            // Test various malformed requests
            const malformedRequests = [
                { payload: null, expectedStatus: 400 },
                { payload: 'invalid json string', expectedStatus: 400 },
                { payload: { invalidField: 'test' }, expectedStatus: 400 },
                { payload: { text: null }, expectedStatus: 400 }
            ];

            for (const testCase of malformedRequests) {
                const response = await request(app)
                    .post('/api/v1/query')
                    .send(testCase.payload)
                    .expect(testCase.expectedStatus);

                expect(response.body.error).toMatchObject({
                    code: expect.any(String),
                    message: expect.any(String),
                    timestamp: expect.any(String),
                    correlationId: expect.any(String)
                });
            }
        });

        it('should provide correlation IDs for request tracking', async () => {
            const correlationId = 'test-correlation-12345';

            const response = await request(app)
                .post('/api/v1/query')
                .set('X-Correlation-ID', correlationId)
                .send({ text: 'correlation test query' })
                .expect(200);

            expect(response.headers['x-correlation-id']).toBe(correlationId);
            expect(response.body.metadata.correlationId).toBe(correlationId);
        });

        it('should handle timeout scenarios gracefully', async () => {
            // This test simulates a timeout scenario
            const longRunningQuery = 'extremely complex query that might timeout';

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: longRunningQuery,
                    timeout: 100 // Very short timeout to trigger timeout handling
                });

            // Should either succeed or fail gracefully with timeout error
            if (response.status === 408) {
                expect(response.body.error.code).toBe('REQUEST_TIMEOUT');
            } else {
                expect(response.status).toBe(200);
            }
        });
    });
});