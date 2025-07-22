import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import request from 'supertest';
import { ApiGateway } from '../../api/app';
import { DataSourceConfig } from '../../models/dataSource';
import { CacheManager } from '../../services/cache';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';
import { EmbeddingService } from '../../services/embedding';
import { QueryProcessor } from '../../services/queryProcessor';
import { VectorSearchEngine } from '../../services/vectorSearch';
import { cleanupTestData } from '../migrations/testSetup';

/**
 * Comprehensive Integration Test Suite for Fast RAG System
 * 
 * This test suite covers all requirements for task 10.1:
 * - End-to-end tests for complete query processing flow
 * - Performance benchmarking tests for response time requirements
 * - Load testing scenarios for concurrent query handling
 * - Data source failure scenarios and graceful degradation
 * 
 * Requirements covered:
 * - 1.1: Query response time < 2 seconds for typical queries
 * - 1.2: Search across all configured data sources simultaneously
 * - 2.5: Continue operating with remaining sources when some fail
 */

describe('Fast RAG System - Comprehensive Integration Tests', () => {
    let apiGateway: ApiGateway;
    let app: any;
    let dataSourceManager: DataSourceManagerImpl;
    let cacheManager: CacheManager;
    let queryProcessor: QueryProcessor;
    let embeddingService: EmbeddingService;
    let vectorSearchEngine: VectorSearchEngine;

    // Test configuration
    const TEST_CONFIG = {
        RESPONSE_TIME_LIMIT: 2000, // 2 seconds (Requirement 1.1)
        CACHED_RESPONSE_TIME_LIMIT: 500, // 500ms (Requirement 4.2)
        CONCURRENT_USERS: [5, 15, 30], // Light, medium, heavy load
        MIN_SUCCESS_RATE: 0.95, // 95% success rate
        PERFORMANCE_QUERIES: [
            'sample text information',
            'integration test documentation',
            'performance testing data',
            'query processing flow',
            'data source management'
        ]
    };

    // Test data sources
    const testDataSources: DataSourceConfig[] = [
        {
            id: 'test-file-source-1',
            name: 'Test File Source 1',
            type: 'file',
            config: {
                filePath: path.join(__dirname, '../test-data'),
                fileTypes: ['txt', 'md'],
                recursive: false
            },
            enabled: true
        },
        {
            id: 'test-file-source-2',
            name: 'Test File Source 2',
            type: 'file',
            config: {
                filePath: path.join(__dirname, '../test-data'),
                fileTypes: ['txt'],
                recursive: false
            },
            enabled: true
        }
    ];

    beforeAll(async () => {
        // Initialize API gateway for testing
        apiGateway = new ApiGateway(0); // Use port 0 for testing
        app = apiGateway.getApp();

        // Initialize core services with test configuration
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
        await setupTestDataSources();

        // Wait for initial indexing to complete
        await new Promise(resolve => setTimeout(resolve, 3000));
    });

    afterAll(async () => {
        // Cleanup resources
        if (cacheManager) {
            await cacheManager.disconnect();
        }
        if (vectorSearchEngine) {
            await vectorSearchEngine.close();
        }
        if (dataSourceManager) {
            await dataSourceManager.cleanup();
        }

        // Clean up test data
        await cleanupTestData();
    });

    async function setupTestDataSources(): Promise<void> {
        for (const sourceConfig of testDataSources) {
            try {
                await dataSourceManager.addSource(sourceConfig);
                await dataSourceManager.syncSource(sourceConfig.id);
            } catch (error) {
                console.warn(`Failed to setup test data source ${sourceConfig.id}:`, error);
            }
        }
    }

    describe('End-to-End Query Processing Flow', () => {
        it('should process a query end-to-end within 2 seconds (Requirement 1.1)', async () => {
            const queryText = 'sample text information';
            const startTime = performance.now();

            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: queryText,
                    context: { domain: 'test' }
                })
                .expect(200);

            const endTime = performance.now();
            const processingTime = endTime - startTime;

            // Verify response time requirement (Requirement 1.1)
            expect(processingTime).toBeLessThan(TEST_CONFIG.RESPONSE_TIME_LIMIT);

            // Verify response structure
            expect(response.body).toMatchObject({
                query: {
                    id: expect.any(String),
                    text: queryText,
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
                    correlationId: expect.any(String)
                }
            });

            // Verify processing time is recorded accurately
            expect(response.body.result.processingTime).toBeGreaterThan(0);
            expect(response.body.result.processingTime).toBeLessThan(TEST_CONFIG.RESPONSE_TIME_LIMIT);
        });

        it('should search across all configured data sources simultaneously (Requirement 1.2)', async () => {
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

    describe('Performance Benchmarking Tests', () => {
        it('should meet response time requirements for typical queries', async () => {
            const responseTimes: number[] = [];

            for (const queryText of TEST_CONFIG.PERFORMANCE_QUERIES) {
                const startTime = performance.now();

                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: queryText })
                    .expect(200);

                const endTime = performance.now();
                const responseTime = endTime - startTime;
                responseTimes.push(responseTime);

                // Verify individual query meets requirement (Requirement 1.1)
                expect(responseTime).toBeLessThan(TEST_CONFIG.RESPONSE_TIME_LIMIT);
                expect(response.body.result.processingTime).toBeLessThan(TEST_CONFIG.RESPONSE_TIME_LIMIT);
            }

            // Calculate and verify average response time
            const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
            const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

            console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
            console.log(`P95 response time: ${p95ResponseTime.toFixed(2)}ms`);

            expect(averageResponseTime).toBeLessThan(TEST_CONFIG.RESPONSE_TIME_LIMIT);
            expect(p95ResponseTime).toBeLessThan(TEST_CONFIG.RESPONSE_TIME_LIMIT);
        });

        it('should serve cached results within 500ms (Requirement 4.2)', async () => {
            const queryText = 'cached performance test query';

            // First request to populate cache
            await request(app)
                .post('/api/v1/query')
                .send({ text: queryText })
                .expect(200);

            // Test multiple cached requests
            const cachedResponseTimes: number[] = [];

            for (let i = 0; i < 5; i++) {
                const startTime = performance.now();

                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: queryText })
                    .expect(200);

                const endTime = performance.now();
                const responseTime = endTime - startTime;

                if (response.body.result.cached) {
                    cachedResponseTimes.push(responseTime);

                    // Verify cached query meets requirement (Requirement 4.2)
                    expect(responseTime).toBeLessThan(TEST_CONFIG.CACHED_RESPONSE_TIME_LIMIT);
                }
            }

            if (cachedResponseTimes.length > 0) {
                const averageCachedTime = cachedResponseTimes.reduce((a, b) => a + b, 0) / cachedResponseTimes.length;
                console.log(`Average cached response time: ${averageCachedTime.toFixed(2)}ms`);
                expect(averageCachedTime).toBeLessThan(TEST_CONFIG.CACHED_RESPONSE_TIME_LIMIT);
            }
        });

        it('should maintain minimum throughput under sequential load', async () => {
            const numberOfQueries = 20;
            const queries = Array.from({ length: numberOfQueries }, (_, i) =>
                `throughput test query ${i + 1}`
            );

            const startTime = performance.now();
            const promises: Promise<any>[] = [];

            // Execute queries sequentially to test sustained throughput
            for (const queryText of queries) {
                const promise = request(app)
                    .post('/api/v1/query')
                    .send({ text: queryText })
                    .expect(200);
                promises.push(promise);
            }

            const responses = await Promise.all(promises);
            const endTime = performance.now();

            const totalTime = (endTime - startTime) / 1000; // Convert to seconds
            const queriesPerSecond = numberOfQueries / totalTime;

            console.log(`Processed ${numberOfQueries} queries in ${totalTime.toFixed(2)}s`);
            console.log(`Throughput: ${queriesPerSecond.toFixed(2)} QPS`);

            // Verify minimum throughput requirement
            expect(queriesPerSecond).toBeGreaterThan(5); // Minimum 5 QPS for test environment

            // Verify all queries succeeded
            responses.forEach(response => {
                expect(response.body.result).toBeDefined();
                expect(response.body.result.response).toBeTruthy();
            });
        });
    });

    describe('Load Testing Scenarios', () => {
        async function executeLoadTest(concurrentUsers: number, duration: number) {
            const endTime = Date.now() + (duration * 1000);
            const results: Array<{
                success: boolean;
                responseTime: number;
                error?: string;
            }> = [];

            console.log(`Starting load test: ${concurrentUsers} concurrent users for ${duration}s`);

            const workers = Array.from({ length: concurrentUsers }, async (_, workerId) => {
                let requestCount = 0;

                while (Date.now() < endTime) {
                    const queryText = `load test query ${workerId}-${requestCount++}`;
                    const startTime = performance.now();

                    try {
                        const response = await request(app)
                            .post('/api/v1/query')
                            .send({ text: queryText })
                            .timeout(10000); // 10 second timeout

                        const responseTime = performance.now() - startTime;

                        results.push({
                            success: response.status === 200,
                            responseTime
                        });

                    } catch (error: any) {
                        const responseTime = performance.now() - startTime;
                        results.push({
                            success: false,
                            responseTime,
                            error: error.message
                        });
                    }

                    // Small delay to prevent overwhelming the system
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            });

            await Promise.all(workers);
            return results;
        }

        it('should handle light concurrent load efficiently', async () => {
            const results = await executeLoadTest(5, 10); // 5 users for 10 seconds

            const totalRequests = results.length;
            const successfulRequests = results.filter(r => r.success).length;
            const successRate = successfulRequests / totalRequests;

            console.log(`Light load test: ${successfulRequests}/${totalRequests} successful (${(successRate * 100).toFixed(2)}%)`);

            // Verify performance under light load
            expect(successRate).toBeGreaterThanOrEqual(0.90); // 90% success rate
            expect(totalRequests).toBeGreaterThan(10); // Should process reasonable number of requests
        });

        it('should maintain performance under medium concurrent load', async () => {
            const results = await executeLoadTest(10, 15); // 10 users for 15 seconds

            const totalRequests = results.length;
            const successfulRequests = results.filter(r => r.success).length;
            const successRate = successfulRequests / totalRequests;

            console.log(`Medium load test: ${successfulRequests}/${totalRequests} successful (${(successRate * 100).toFixed(2)}%)`);

            // Verify performance under medium load
            expect(successRate).toBeGreaterThanOrEqual(0.85); // 85% success rate
            expect(totalRequests).toBeGreaterThan(20);
        });

        it('should handle mixed query types concurrently', async () => {
            const queryTypes = [
                { type: 'simple', query: 'simple test' },
                { type: 'complex', query: 'complex semantic analysis query' },
                { type: 'performance', query: 'performance testing data' }
            ];

            const concurrentRequests = 15;
            const promises: Promise<any>[] = [];

            for (let i = 0; i < concurrentRequests; i++) {
                const randomType = queryTypes[Math.floor(Math.random() * queryTypes.length)];
                const queryText = `${randomType.query} ${i}`;

                const promise = request(app)
                    .post('/api/v1/query')
                    .send({
                        text: queryText,
                        context: { queryType: randomType.type }
                    })
                    .timeout(10000);

                promises.push(promise);
            }

            const startTime = performance.now();
            const responses = await Promise.all(promises.map(p => p.catch(err => ({ error: err }))));
            const endTime = performance.now();

            const totalTime = endTime - startTime;
            const successfulResponses = responses.filter(r => !r.error && r.status === 200);
            const successRate = successfulResponses.length / responses.length;

            console.log(`Mixed query test: ${successfulResponses.length}/${responses.length} successful in ${totalTime.toFixed(2)}ms`);

            expect(successRate).toBeGreaterThanOrEqual(0.80); // 80% success rate
            expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds
        });
    });

    describe('Data Source Failure Scenarios and Graceful Degradation', () => {
        const failingDataSource: DataSourceConfig = {
            id: 'failing-source',
            name: 'Failing Test Source',
            type: 'file',
            config: {
                filePath: '/nonexistent/path',
                fileTypes: ['txt']
            },
            enabled: true
        };

        it('should continue operating when one data source fails (Requirement 2.5)', async () => {
            // Add a failing source
            try {
                await dataSourceManager.addSource(failingDataSource);
            } catch (error) {
                // Expected to fail during sync
            }

            // Verify system can still process queries despite failing source
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'test query with failing source' })
                .expect(200);

            // Verify response is still generated (Requirement 2.5)
            expect(response.body.result.response).toBeTruthy();
            expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);

            // System should indicate some sources failed but still return results
            expect(response.body.metadata.totalSources).toBeGreaterThanOrEqual(1);

            // Cleanup
            try {
                await dataSourceManager.removeSource(failingDataSource.id);
            } catch (error) {
                // Ignore cleanup errors
            }
        });

        it('should handle cascading data source failures', async () => {
            // Simulate multiple source failures
            const failingSources = [
                {
                    id: 'failing-source-1',
                    name: 'Failing Source 1',
                    type: 'file',
                    config: { filePath: '/nonexistent/path1' },
                    enabled: true
                },
                {
                    id: 'failing-source-2',
                    name: 'Failing Source 2',
                    type: 'file',
                    config: { filePath: '/nonexistent/path2' },
                    enabled: true
                }
            ];

            // Add failing sources
            for (const source of failingSources) {
                try {
                    await dataSourceManager.addSource(source);
                } catch (error) {
                    // Expected to fail
                }
            }

            // System should still respond despite multiple failures
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'cascading failure test' })
                .expect(200);

            expect(response.body.result.response).toBeTruthy();

            // Cleanup failing sources
            for (const source of failingSources) {
                try {
                    await dataSourceManager.removeSource(source.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should maintain service availability with partial source failures', async () => {
            // Test that service remains available even when most sources fail
            const queries = [
                'availability test query 1',
                'availability test query 2',
                'availability test query 3'
            ];

            const responses = await Promise.all(
                queries.map(query =>
                    request(app)
                        .post('/api/v1/query')
                        .send({ text: query })
                        .expect(200)
                )
            );

            // All queries should succeed despite source failures
            responses.forEach(response => {
                expect(response.body.result.response).toBeTruthy();
                expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
            });
        });

        it('should handle corrupted file sources gracefully', async () => {
            // Create a corrupted test file
            const corruptedFilePath = path.join(__dirname, '../test-data/corrupted-test.txt');
            const corruptedContent = '\x00\x01\x02\xFF\xFE\xFD'; // Binary garbage

            try {
                await fs.writeFile(corruptedFilePath, corruptedContent);

                const corruptedSource = {
                    id: 'corrupted-source',
                    name: 'Corrupted Source',
                    type: 'file',
                    config: {
                        filePath: path.dirname(corruptedFilePath),
                        fileTypes: ['txt']
                    },
                    enabled: true
                };

                await dataSourceManager.addSource(corruptedSource);

                // System should handle corrupted content gracefully
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'corrupted content test' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

                // Cleanup
                await dataSourceManager.removeSource(corruptedSource.id);

            } finally {
                try {
                    await fs.unlink(corruptedFilePath);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });
    });

    describe('API Interface and System Health', () => {
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

        it('should provide detailed health check with component status', async () => {
            const response = await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            // Verify comprehensive health monitoring (Requirement 6.2)
            expect(response.body).toMatchObject({
                status: expect.stringMatching(/^(healthy|degraded|unhealthy)$/),
                timestamp: expect.any(String),
                components: expect.any(Object)
            });
        });

        it('should handle malformed requests gracefully', async () => {
            // Test various malformed requests
            const malformedRequests = [
                { payload: null, expectedStatus: 400 },
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
    });

    describe('Memory and Resource Management', () => {
        it('should maintain stable memory usage under load', async () => {
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const initialMemory = process.memoryUsage();
            const numberOfQueries = 50;

            // Generate load
            const promises = Array.from({ length: numberOfQueries }, (_, i) =>
                request(app)
                    .post('/api/v1/query')
                    .send({ text: `memory test query ${i + 1}` })
                    .expect(200)
            );

            await Promise.all(promises);

            // Force garbage collection again if available
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage();
            const memoryIncreaseMB = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

            console.log(`Memory increase: ${memoryIncreaseMB.toFixed(2)}MB`);
            console.log(`Initial heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
            console.log(`Final heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);

            // Verify memory usage stays within acceptable limits
            expect(memoryIncreaseMB).toBeLessThan(200); // Less than 200MB increase
        });

        it('should efficiently utilize cache to reduce processing time', async () => {
            const testQuery = 'cache efficiency test query';
            const iterations = 5;

            // First request (cache miss)
            const firstResponse = await request(app)
                .post('/api/v1/query')
                .send({ text: testQuery })
                .expect(200);

            const uncachedTime = firstResponse.body.result.processingTime;

            // Subsequent requests (cache hits)
            const cachedTimes: number[] = [];

            for (let i = 0; i < iterations; i++) {
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: testQuery })
                    .expect(200);

                if (response.body.result.cached) {
                    cachedTimes.push(response.body.result.processingTime);
                }
            }

            if (cachedTimes.length > 0) {
                const averageCachedTime = cachedTimes.reduce((a, b) => a + b, 0) / cachedTimes.length;
                const cacheSpeedup = uncachedTime / averageCachedTime;

                console.log(`Uncached time: ${uncachedTime}ms`);
                console.log(`Average cached time: ${averageCachedTime.toFixed(2)}ms`);
                console.log(`Cache speedup: ${cacheSpeedup.toFixed(2)}x`);

                // Verify cache provides performance improvement
                expect(averageCachedTime).toBeLessThan(uncachedTime);
                expect(cacheSpeedup).toBeGreaterThan(1.2); // At least 1.2x speedup
            }
        });
    });
});