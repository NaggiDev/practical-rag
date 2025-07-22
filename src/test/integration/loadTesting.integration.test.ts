import { performance } from 'perf_hooks';
import request from 'supertest';
import { ApiGateway } from '../../api/app';
import { CacheManager } from '../../services/cache';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';

describe('Load Testing - Concurrent Query Handling', () => {
    let apiGateway: ApiGateway;
    let app: any;
    let dataSourceManager: DataSourceManagerImpl;
    let cacheManager: CacheManager;

    // Load testing configuration
    const LOAD_TEST_CONFIG = {
        LIGHT_LOAD: { concurrent: 5, duration: 10 },
        MEDIUM_LOAD: { concurrent: 15, duration: 20 },
        HEAVY_LOAD: { concurrent: 30, duration: 30 },
        STRESS_LOAD: { concurrent: 50, duration: 15 },
        MAX_ACCEPTABLE_RESPONSE_TIME: 5000, // 5 seconds under load
        MIN_SUCCESS_RATE: 0.95, // 95% success rate
        MAX_ERROR_RATE: 0.05 // 5% error rate
    };

    beforeAll(async () => {
        // Initialize API gateway for testing
        apiGateway = new ApiGateway(0);
        app = apiGateway.getApp();

        // Initialize services with optimized settings for load testing
        dataSourceManager = new DataSourceManagerImpl();
        cacheManager = new CacheManager({
            provider: 'memory',
            ttl: 600, // Longer TTL for load testing
            maxSize: 5000 // Larger cache for load testing
        });

        // Setup test data sources
        await setupLoadTestData();
    });

    afterAll(async () => {
        if (cacheManager) {
            await cacheManager.disconnect();
        }
        if (dataSourceManager) {
            await dataSourceManager.cleanup();
        }
    });

    async function setupLoadTestData() {
        const testSource = {
            id: 'load-test-source',
            name: 'Load Test Source',
            type: 'file',
            config: {
                filePath: __dirname + '/../test-data',
                fileTypes: ['txt', 'md']
            },
            enabled: true
        };

        try {
            await dataSourceManager.addSource(testSource);
            await dataSourceManager.syncSource(testSource.id);
            // Wait for indexing to complete
            await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
            console.warn('Failed to setup load test data:', error);
        }
    }

    async function executeLoadTest(config: { concurrent: number; duration: number }) {
        const { concurrent, duration } = config;
        const endTime = Date.now() + (duration * 1000);
        const results: Array<{
            success: boolean;
            responseTime: number;
            error?: string;
            timestamp: number;
        }> = [];

        console.log(`Starting load test: ${concurrent} concurrent users for ${duration}s`);

        const workers = Array.from({ length: concurrent }, async (_, workerId) => {
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
                        responseTime,
                        timestamp: Date.now()
                    });

                } catch (error: any) {
                    const responseTime = performance.now() - startTime;
                    results.push({
                        success: false,
                        responseTime,
                        error: error.message,
                        timestamp: Date.now()
                    });
                }

                // Small delay to prevent overwhelming the system
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        });

        await Promise.all(workers);
        return results;
    }

    function analyzeLoadTestResults(results: Array<{ success: boolean; responseTime: number; error?: string }>) {
        const totalRequests = results.length;
        const successfulRequests = results.filter(r => r.success).length;
        const failedRequests = totalRequests - successfulRequests;

        const successRate = successfulRequests / totalRequests;
        const errorRate = failedRequests / totalRequests;

        const responseTimes = results.filter(r => r.success).map(r => r.responseTime);
        const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;

        responseTimes.sort((a, b) => a - b);
        const p50 = responseTimes[Math.floor(responseTimes.length * 0.5)];
        const p95 = responseTimes[Math.floor(responseTimes.length * 0.95)];
        const p99 = responseTimes[Math.floor(responseTimes.length * 0.99)];
        const maxResponseTime = Math.max(...responseTimes);

        const errorTypes = results
            .filter(r => !r.success)
            .reduce((acc: { [key: string]: number }, r) => {
                const errorType = r.error || 'Unknown';
                acc[errorType] = (acc[errorType] || 0) + 1;
                return acc;
            }, {});

        return {
            totalRequests,
            successfulRequests,
            failedRequests,
            successRate,
            errorRate,
            avgResponseTime,
            p50,
            p95,
            p99,
            maxResponseTime,
            errorTypes
        };
    }

    describe('Light Load Testing', () => {
        it('should handle light concurrent load efficiently', async () => {
            const results = await executeLoadTest(LOAD_TEST_CONFIG.LIGHT_LOAD);
            const analysis = analyzeLoadTestResults(results);

            console.log('Light Load Test Results:', {
                totalRequests: analysis.totalRequests,
                successRate: `${(analysis.successRate * 100).toFixed(2)}%`,
                avgResponseTime: `${analysis.avgResponseTime.toFixed(2)}ms`,
                p95ResponseTime: `${analysis.p95.toFixed(2)}ms`
            });

            // Verify performance under light load
            expect(analysis.successRate).toBeGreaterThanOrEqual(LOAD_TEST_CONFIG.MIN_SUCCESS_RATE);
            expect(analysis.errorRate).toBeLessThanOrEqual(LOAD_TEST_CONFIG.MAX_ERROR_RATE);
            expect(analysis.avgResponseTime).toBeLessThan(2000); // Should be fast under light load
            expect(analysis.p95).toBeLessThan(3000);
            expect(analysis.totalRequests).toBeGreaterThan(10); // Should process reasonable number of requests
        });
    });

    describe('Medium Load Testing', () => {
        it('should maintain performance under medium concurrent load', async () => {
            const results = await executeLoadTest(LOAD_TEST_CONFIG.MEDIUM_LOAD);
            const analysis = analyzeLoadTestResults(results);

            console.log('Medium Load Test Results:', {
                totalRequests: analysis.totalRequests,
                successRate: `${(analysis.successRate * 100).toFixed(2)}%`,
                avgResponseTime: `${analysis.avgResponseTime.toFixed(2)}ms`,
                p95ResponseTime: `${analysis.p95.toFixed(2)}ms`,
                errorTypes: analysis.errorTypes
            });

            // Verify performance under medium load
            expect(analysis.successRate).toBeGreaterThanOrEqual(LOAD_TEST_CONFIG.MIN_SUCCESS_RATE);
            expect(analysis.errorRate).toBeLessThanOrEqual(LOAD_TEST_CONFIG.MAX_ERROR_RATE);
            expect(analysis.avgResponseTime).toBeLessThan(3000);
            expect(analysis.p95).toBeLessThan(LOAD_TEST_CONFIG.MAX_ACCEPTABLE_RESPONSE_TIME);
            expect(analysis.totalRequests).toBeGreaterThan(50);
        });
    });

    describe('Heavy Load Testing', () => {
        it('should handle heavy concurrent load with acceptable degradation', async () => {
            const results = await executeLoadTest(LOAD_TEST_CONFIG.HEAVY_LOAD);
            const analysis = analyzeLoadTestResults(results);

            console.log('Heavy Load Test Results:', {
                totalRequests: analysis.totalRequests,
                successRate: `${(analysis.successRate * 100).toFixed(2)}%`,
                avgResponseTime: `${analysis.avgResponseTime.toFixed(2)}ms`,
                p95ResponseTime: `${analysis.p95.toFixed(2)}ms`,
                p99ResponseTime: `${analysis.p99.toFixed(2)}ms`,
                maxResponseTime: `${analysis.maxResponseTime.toFixed(2)}ms`,
                errorTypes: analysis.errorTypes
            });

            // Verify system can handle heavy load with some acceptable degradation
            expect(analysis.successRate).toBeGreaterThanOrEqual(0.90); // Slightly lower success rate acceptable
            expect(analysis.errorRate).toBeLessThanOrEqual(0.10); // Slightly higher error rate acceptable
            expect(analysis.avgResponseTime).toBeLessThan(LOAD_TEST_CONFIG.MAX_ACCEPTABLE_RESPONSE_TIME);
            expect(analysis.p95).toBeLessThan(LOAD_TEST_CONFIG.MAX_ACCEPTABLE_RESPONSE_TIME * 1.2);
            expect(analysis.totalRequests).toBeGreaterThan(100);
        });
    });

    describe('Stress Testing', () => {
        it('should survive stress conditions and recover gracefully', async () => {
            const results = await executeLoadTest(LOAD_TEST_CONFIG.STRESS_LOAD);
            const analysis = analyzeLoadTestResults(results);

            console.log('Stress Test Results:', {
                totalRequests: analysis.totalRequests,
                successRate: `${(analysis.successRate * 100).toFixed(2)}%`,
                avgResponseTime: `${analysis.avgResponseTime.toFixed(2)}ms`,
                p95ResponseTime: `${analysis.p95.toFixed(2)}ms`,
                p99ResponseTime: `${analysis.p99.toFixed(2)}ms`,
                errorTypes: analysis.errorTypes
            });

            // Under stress, system should still function but with degraded performance
            expect(analysis.successRate).toBeGreaterThanOrEqual(0.80); // 80% success rate under stress
            expect(analysis.totalRequests).toBeGreaterThan(50);

            // Verify system recovers after stress test
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for recovery

            const recoveryResponse = await request(app)
                .post('/api/v1/query')
                .send({ text: 'recovery test query' })
                .expect(200);

            expect(recoveryResponse.body.result.response).toBeTruthy();
        });
    });

    describe('Concurrent Query Patterns', () => {
        it('should handle mixed query types concurrently', async () => {
            const queryTypes = [
                { type: 'simple', query: 'simple test', weight: 0.4 },
                { type: 'complex', query: 'complex semantic analysis query', weight: 0.3 },
                { type: 'filtered', query: 'filtered search', filters: [{ field: 'type', operator: 'eq', value: 'doc' }], weight: 0.3 }
            ];

            const concurrentRequests = 20;
            const promises: Promise<any>[] = [];

            for (let i = 0; i < concurrentRequests; i++) {
                const randomType = queryTypes[Math.floor(Math.random() * queryTypes.length)];
                const queryText = `${randomType.query} ${i}`;

                const promise = request(app)
                    .post('/api/v1/query')
                    .send({
                        text: queryText,
                        filters: randomType.filters,
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

            expect(successRate).toBeGreaterThanOrEqual(0.90);
            expect(totalTime).toBeLessThan(10000); // Should complete within 10 seconds
        });

        it('should handle burst traffic followed by sustained load', async () => {
            // Initial burst
            const burstSize = 25;
            const burstPromises = Array.from({ length: burstSize }, (_, i) =>
                request(app)
                    .post('/api/v1/query')
                    .send({ text: `burst query ${i}` })
                    .timeout(10000)
            );

            const burstStart = performance.now();
            const burstResponses = await Promise.all(burstPromises.map(p => p.catch(err => ({ error: err }))));
            const burstEnd = performance.now();

            const burstSuccessRate = burstResponses.filter(r => !r.error && r.status === 200).length / burstSize;
            console.log(`Burst phase: ${(burstSuccessRate * 100).toFixed(2)}% success in ${(burstEnd - burstStart).toFixed(2)}ms`);

            // Sustained load after burst
            const sustainedResults = await executeLoadTest({ concurrent: 10, duration: 15 });
            const sustainedAnalysis = analyzeLoadTestResults(sustainedResults);

            console.log(`Sustained phase: ${(sustainedAnalysis.successRate * 100).toFixed(2)}% success, avg ${sustainedAnalysis.avgResponseTime.toFixed(2)}ms`);

            // Both phases should succeed
            expect(burstSuccessRate).toBeGreaterThanOrEqual(0.85);
            expect(sustainedAnalysis.successRate).toBeGreaterThanOrEqual(0.90);
            expect(sustainedAnalysis.avgResponseTime).toBeLessThan(4000);
        });
    });

    describe('Resource Utilization Under Load', () => {
        it('should maintain stable resource usage during sustained load', async () => {
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }

            const initialMemory = process.memoryUsage();
            const startTime = Date.now();

            // Run sustained load test
            const results = await executeLoadTest({ concurrent: 15, duration: 30 });
            const analysis = analyzeLoadTestResults(results);

            // Force garbage collection again
            if (global.gc) {
                global.gc();
            }

            const finalMemory = process.memoryUsage();
            const endTime = Date.now();

            const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
            const testDuration = (endTime - startTime) / 1000;

            console.log(`Resource utilization during ${testDuration.toFixed(2)}s load test:`);
            console.log(`- Memory increase: ${memoryIncrease.toFixed(2)}MB`);
            console.log(`- Requests processed: ${analysis.totalRequests}`);
            console.log(`- Success rate: ${(analysis.successRate * 100).toFixed(2)}%`);
            console.log(`- Average response time: ${analysis.avgResponseTime.toFixed(2)}ms`);

            // Verify resource usage is reasonable
            expect(memoryIncrease).toBeLessThan(200); // Less than 200MB increase
            expect(analysis.successRate).toBeGreaterThanOrEqual(0.90);
            expect(analysis.totalRequests).toBeGreaterThan(100);
        });

        it('should handle memory pressure gracefully', async () => {
            // Create memory pressure by generating large queries
            const largeQueries = Array.from({ length: 10 }, (_, i) => ({
                text: `large query ${i}`,
                context: {
                    largeData: 'x'.repeat(10000), // 10KB of data per query
                    metadata: Array.from({ length: 100 }, (_, j) => `item-${j}`)
                }
            }));

            const promises = largeQueries.map(query =>
                request(app)
                    .post('/api/v1/query')
                    .send(query)
                    .timeout(15000)
            );

            const responses = await Promise.all(promises.map(p => p.catch(err => ({ error: err }))));
            const successfulResponses = responses.filter(r => !r.error && r.status === 200);

            console.log(`Memory pressure test: ${successfulResponses.length}/${responses.length} successful`);

            // System should handle memory pressure without complete failure
            expect(successfulResponses.length).toBeGreaterThan(responses.length * 0.7); // At least 70% success
        });
    });

    describe('Cache Performance Under Load', () => {
        it('should maintain cache effectiveness during concurrent access', async () => {
            const cacheTestQueries = [
                'cache test query 1',
                'cache test query 2',
                'cache test query 3'
            ];

            // Populate cache
            for (const query of cacheTestQueries) {
                await request(app)
                    .post('/api/v1/query')
                    .send({ text: query })
                    .expect(200);
            }

            // Test concurrent cache access
            const concurrentCacheRequests = 30;
            const promises: Promise<any>[] = [];

            for (let i = 0; i < concurrentCacheRequests; i++) {
                const query = cacheTestQueries[i % cacheTestQueries.length];
                promises.push(
                    request(app)
                        .post('/api/v1/query')
                        .send({ text: query })
                        .timeout(5000)
                );
            }

            const startTime = performance.now();
            const responses = await Promise.all(promises.map(p => p.catch(err => ({ error: err }))));
            const endTime = performance.now();

            const successfulResponses = responses.filter(r => !r.error && r.status === 200);
            const cachedResponses = successfulResponses.filter(r => r.body?.result?.cached);
            const cacheHitRate = cachedResponses.length / successfulResponses.length;
            const avgResponseTime = (endTime - startTime) / concurrentCacheRequests;

            console.log(`Cache performance under load:`);
            console.log(`- Cache hit rate: ${(cacheHitRate * 100).toFixed(2)}%`);
            console.log(`- Average response time: ${avgResponseTime.toFixed(2)}ms`);
            console.log(`- Successful requests: ${successfulResponses.length}/${responses.length}`);

            // Verify cache performance
            expect(cacheHitRate).toBeGreaterThan(0.5); // At least 50% cache hit rate
            expect(avgResponseTime).toBeLessThan(1000); // Fast average response time
            expect(successfulResponses.length / responses.length).toBeGreaterThanOrEqual(0.95);
        });
    });
});