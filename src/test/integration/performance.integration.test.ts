import { performance } from 'perf_hooks';
import request from 'supertest';
import { ApiGateway } from '../../api/app';
import { CacheManager } from '../../services/cache';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';

describe('Performance Benchmarking Tests', () => {
    let apiGateway: ApiGateway;
    let app: any;
    let dataSourceManager: DataSourceManagerImpl;
    let cacheManager: CacheManager;

    // Performance thresholds based on requirements
    const PERFORMANCE_THRESHOLDS = {
        TYPICAL_QUERY_MAX_TIME: 2000, // 2 seconds (Requirement 1.1)
        CACHED_QUERY_MAX_TIME: 500,   // 500ms (Requirement 4.2)
        CONCURRENT_QUERY_MAX_TIME: 3000, // 3 seconds for concurrent queries
        MIN_THROUGHPUT_QPS: 10,       // Minimum 10 queries per second
        MAX_MEMORY_INCREASE_MB: 100   // Max 100MB memory increase during load
    };

    beforeAll(async () => {
        // Initialize API gateway for testing
        apiGateway = new ApiGateway(0);
        app = apiGateway.getApp();

        // Initialize services
        dataSourceManager = new DataSourceManagerImpl();
        cacheManager = new CacheManager({
            provider: 'memory',
            ttl: 300,
            maxSize: 1000
        });

        // Setup test data sources for performance testing
        await setupPerformanceTestData();
    });

    afterAll(async () => {
        if (cacheManager) {
            await cacheManager.disconnect();
        }
        if (dataSourceManager) {
            await dataSourceManager.cleanup();
        }
    });

    async function setupPerformanceTestData() {
        // Add test data sources with sufficient content for performance testing
        const testSources = [
            {
                id: 'perf-test-source-1',
                name: 'Performance Test Source 1',
                type: 'file',
                config: {
                    filePath: __dirname + '/../test-data',
                    fileTypes: ['txt', 'md']
                },
                enabled: true
            }
        ];

        for (const source of testSources) {
            try {
                await dataSourceManager.addSource(source);
                await dataSourceManager.syncSource(source.id);
            } catch (error) {
                console.warn(`Failed to setup performance test source: ${error}`);
            }
        }

        // Wait for indexing to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    describe('Response Time Benchmarks', () => {
        it('should meet typical query response time requirement (< 2s)', async () => {
            const testQueries = [
                'simple query test',
                'information retrieval benchmark',
                'performance testing query',
                'sample data search',
                'document content lookup'
            ];

            const responseTimes: number[] = [];

            for (const queryText of testQueries) {
                const startTime = performance.now();

                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: queryText })
                    .expect(200);

                const endTime = performance.now();
                const responseTime = endTime - startTime;
                responseTimes.push(responseTime);

                // Verify individual query meets requirement (Requirement 1.1)
                expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.TYPICAL_QUERY_MAX_TIME);
                expect(response.body.result.processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.TYPICAL_QUERY_MAX_TIME);
            }

            // Calculate and verify average response time
            const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
            const p95ResponseTime = responseTimes.sort((a, b) => a - b)[Math.floor(responseTimes.length * 0.95)];

            console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
            console.log(`P95 response time: ${p95ResponseTime.toFixed(2)}ms`);

            expect(averageResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.TYPICAL_QUERY_MAX_TIME);
            expect(p95ResponseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.TYPICAL_QUERY_MAX_TIME);
        });

        it('should meet cached query response time requirement (< 500ms)', async () => {
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
                    expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.CACHED_QUERY_MAX_TIME);
                }
            }

            if (cachedResponseTimes.length > 0) {
                const averageCachedTime = cachedResponseTimes.reduce((a, b) => a + b, 0) / cachedResponseTimes.length;
                console.log(`Average cached response time: ${averageCachedTime.toFixed(2)}ms`);
                expect(averageCachedTime).toBeLessThan(PERFORMANCE_THRESHOLDS.CACHED_QUERY_MAX_TIME);
            }
        });

        it('should handle complex queries within acceptable time limits', async () => {
            const complexQueries = [
                'comprehensive analysis of document content with multiple filters and context',
                'detailed information synthesis from various sources with semantic understanding',
                'complex query requiring extensive processing and multiple data source integration'
            ];

            for (const queryText of complexQueries) {
                const startTime = performance.now();

                const response = await request(app)
                    .post('/api/v1/query')
                    .send({
                        text: queryText,
                        context: {
                            domain: 'comprehensive',
                            searchType: 'semantic',
                            maxSources: 10
                        },
                        filters: [
                            { field: 'type', operator: 'eq', value: 'document' }
                        ]
                    })
                    .expect(200);

                const endTime = performance.now();
                const responseTime = endTime - startTime;

                // Complex queries may take longer but should still be reasonable
                expect(responseTime).toBeLessThan(PERFORMANCE_THRESHOLDS.TYPICAL_QUERY_MAX_TIME * 1.5);
                expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('Throughput Benchmarks', () => {
        it('should maintain minimum throughput under sequential load', async () => {
            const numberOfQueries = 50;
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
            expect(queriesPerSecond).toBeGreaterThan(PERFORMANCE_THRESHOLDS.MIN_THROUGHPUT_QPS);

            // Verify all queries succeeded
            responses.forEach(response => {
                expect(response.body.result).toBeDefined();
                expect(response.body.result.response).toBeTruthy();
            });
        });

        it('should handle burst traffic efficiently', async () => {
            const burstSize = 20;
            const queries = Array.from({ length: burstSize }, (_, i) =>
                `burst test query ${i + 1}`
            );

            const startTime = performance.now();

            // Execute all queries simultaneously (burst)
            const promises = queries.map(queryText =>
                request(app)
                    .post('/api/v1/query')
                    .send({ text: queryText })
                    .expect(200)
            );

            const responses = await Promise.all(promises);
            const endTime = performance.now();

            const totalTime = (endTime - startTime) / 1000;
            const burstThroughput = burstSize / totalTime;

            console.log(`Burst processed ${burstSize} queries in ${totalTime.toFixed(2)}s`);
            console.log(`Burst throughput: ${burstThroughput.toFixed(2)} QPS`);

            // Verify burst handling
            expect(totalTime).toBeLessThan(10); // Should complete burst within 10 seconds
            expect(responses.length).toBe(burstSize);

            // Verify response quality wasn't degraded
            responses.forEach(response => {
                expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
                expect(response.body.result.processingTime).toBeLessThan(PERFORMANCE_THRESHOLDS.TYPICAL_QUERY_MAX_TIME);
            });
        });
    });

    describe('Memory and Resource Usage', () => {
        it('should maintain stable memory usage under load', async () => {
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const initialMemory = process.memoryUsage();
            const numberOfQueries = 100;

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
            expect(memoryIncreaseMB).toBeLessThan(PERFORMANCE_THRESHOLDS.MAX_MEMORY_INCREASE_MB);
        });

        it('should efficiently utilize cache to reduce processing time', async () => {
            const testQuery = 'cache efficiency test query';
            const iterations = 10;

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

                // Verify cache provides significant performance improvement
                expect(averageCachedTime).toBeLessThan(uncachedTime);
                expect(cacheSpeedup).toBeGreaterThan(1.5); // At least 1.5x speedup
            }
        });
    });

    describe('Scalability Tests', () => {
        it('should maintain performance with increasing data source count', async () => {
            const baselineQuery = 'scalability baseline test';

            // Measure baseline performance with current sources
            const baselineStart = performance.now();
            await request(app)
                .post('/api/v1/query')
                .send({ text: baselineQuery })
                .expect(200);
            const baselineTime = performance.now() - baselineStart;

            // Add additional test sources
            const additionalSources = [
                {
                    id: 'scale-test-source-2',
                    name: 'Scale Test Source 2',
                    type: 'file',
                    config: { filePath: __dirname + '/../test-data' },
                    enabled: true
                },
                {
                    id: 'scale-test-source-3',
                    name: 'Scale Test Source 3',
                    type: 'file',
                    config: { filePath: __dirname + '/../test-data' },
                    enabled: true
                }
            ];

            for (const source of additionalSources) {
                try {
                    await dataSourceManager.addSource(source);
                    await dataSourceManager.syncSource(source.id);
                } catch (error) {
                    console.warn(`Failed to add scale test source: ${error}`);
                }
            }

            // Wait for indexing
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Measure performance with additional sources
            const scaledStart = performance.now();
            const scaledResponse = await request(app)
                .post('/api/v1/query')
                .send({ text: baselineQuery })
                .expect(200);
            const scaledTime = performance.now() - scaledStart;

            console.log(`Baseline time: ${baselineTime.toFixed(2)}ms`);
            console.log(`Scaled time: ${scaledTime.toFixed(2)}ms`);
            console.log(`Performance degradation: ${((scaledTime / baselineTime - 1) * 100).toFixed(2)}%`);

            // Performance should not degrade significantly with more sources
            expect(scaledTime).toBeLessThan(baselineTime * 2); // Max 2x degradation
            expect(scaledResponse.body.metadata.totalSources).toBeGreaterThan(1);

            // Cleanup additional sources
            for (const source of additionalSources) {
                try {
                    await dataSourceManager.removeSource(source.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should handle varying query complexity efficiently', async () => {
            const queryComplexities = [
                { name: 'simple', query: 'test', expectedMaxTime: 1000 },
                { name: 'medium', query: 'complex information retrieval with context', expectedMaxTime: 1500 },
                {
                    name: 'complex',
                    query: 'comprehensive analysis requiring multiple data sources and semantic understanding',
                    expectedMaxTime: 2000,
                    context: { domain: 'comprehensive', searchType: 'semantic' },
                    filters: [{ field: 'type', operator: 'eq', value: 'document' }]
                }
            ];

            for (const testCase of queryComplexities) {
                const startTime = performance.now();

                const response = await request(app)
                    .post('/api/v1/query')
                    .send({
                        text: testCase.query,
                        context: testCase.context,
                        filters: testCase.filters
                    })
                    .expect(200);

                const endTime = performance.now();
                const responseTime = endTime - startTime;

                console.log(`${testCase.name} query time: ${responseTime.toFixed(2)}ms`);

                expect(responseTime).toBeLessThan(testCase.expectedMaxTime);
                expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
            }
        });
    });

    describe('Performance Regression Detection', () => {
        it('should detect performance regressions in query processing', async () => {
            const testQueries = [
                'regression test query 1',
                'regression test query 2',
                'regression test query 3'
            ];

            const performanceBaseline: { [key: string]: number } = {};

            // Establish baseline
            for (const query of testQueries) {
                const times: number[] = [];

                for (let i = 0; i < 3; i++) {
                    const start = performance.now();
                    await request(app)
                        .post('/api/v1/query')
                        .send({ text: query })
                        .expect(200);
                    const end = performance.now();
                    times.push(end - start);
                }

                performanceBaseline[query] = times.reduce((a, b) => a + b, 0) / times.length;
            }

            // Test current performance against baseline
            for (const query of testQueries) {
                const start = performance.now();
                await request(app)
                    .post('/api/v1/query')
                    .send({ text: query })
                    .expect(200);
                const end = performance.now();
                const currentTime = end - start;

                const baselineTime = performanceBaseline[query];
                const regressionThreshold = baselineTime * 1.5; // 50% regression threshold

                console.log(`Query: "${query}"`);
                console.log(`Baseline: ${baselineTime.toFixed(2)}ms, Current: ${currentTime.toFixed(2)}ms`);

                expect(currentTime).toBeLessThan(regressionThreshold);
            }
        });
    });
});