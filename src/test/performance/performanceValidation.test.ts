import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { SystemConfig } from '../../models/config';
import { CacheManager } from '../../services/cache';
import { DataSourceManager } from '../../services/dataSourceManager';
import { EmbeddingService } from '../../services/embedding';
import { QueryProcessor } from '../../services/queryProcessor';
import { VectorDatabase } from '../../services/vectorSearch';
import { logger } from '../../utils/logger';
import { PerformanceThresholds, PerformanceValidator } from './performanceValidator';

describe('Performance Validation', () => {
    let performanceValidator: PerformanceValidator;
    let queryProcessor: QueryProcessor;
    let cacheManager: CacheManager;
    let dataSourceManager: DataSourceManager;
    let embeddingService: EmbeddingService;
    let vectorDatabase: VectorDatabase;
    let config: SystemConfig;

    beforeAll(async () => {
        // Setup test configuration
        config = {
            server: {
                port: 3000,
                host: 'localhost',
                cors: { enabled: true, origins: ['*'] },
                rateLimit: { enabled: true, windowMs: 60000, maxRequests: 100 }
            },
            database: {
                metadata: { connectionString: 'sqlite://./test-metadata.db' },
                vector: {
                    provider: 'faiss' as const,
                    dimension: 384,
                    indexType: 'flat',
                    connectionString: './test-vector.index'
                }
            },
            cache: {
                provider: 'redis' as const,
                connectionString: 'redis://localhost:6379',
                ttl: 3600,
                maxMemory: '100mb'
            },
            embedding: {
                provider: 'sentence-transformers' as const,
                model: 'all-MiniLM-L6-v2',
                batchSize: 32,
                maxTokens: 512
            },
            search: {
                maxResults: 10,
                similarityThreshold: 0.7,
                enableHybridSearch: true,
                rerankResults: true
            },
            dataSources: [],
            monitoring: {
                enabled: true,
                metricsInterval: 60000,
                healthCheckInterval: 30000,
                logLevel: 'info' as const
            }
        };

        // Initialize services
        cacheManager = new CacheManager(config.cache);
        await cacheManager.initialize();

        embeddingService = new EmbeddingService(config.embedding);
        await embeddingService.initialize();

        vectorDatabase = new VectorDatabase(config.database.vector);
        await vectorDatabase.initialize();

        dataSourceManager = new DataSourceManager(config, embeddingService, vectorDatabase);
        await dataSourceManager.initialize();

        queryProcessor = new QueryProcessor({
            maxConcurrentQueries: 10,
            defaultTimeout: 30000,
            enableParallelSearch: true,
            cacheEnabled: true,
            enableQueryOptimization: true,
            enableResultRanking: true
        }, cacheManager, dataSourceManager, embeddingService, vectorDatabase);

        performanceValidator = new PerformanceValidator(
            queryProcessor,
            cacheManager,
            dataSourceManager,
            config
        );

        // Add some test data sources for realistic testing
        await dataSourceManager.addDataSource({
            id: 'test-source-1',
            name: 'Test Documentation',
            type: 'file',
            config: {
                filePath: './test-data/sample-docs.txt',
                fileType: 'txt',
                encoding: 'utf-8'
            },
            status: 'active',
            lastSync: new Date(),
            documentCount: 10
        });

        logger.info('Performance validation test setup completed');
    });

    afterAll(async () => {
        // Cleanup
        await cacheManager.close();
        await vectorDatabase.close();
        await dataSourceManager.close();
    });

    describe('Response Time Validation', () => {
        it('should validate response times are under 2 seconds for typical queries', async () => {
            const testQueries = [
                'What is the main topic of the documents?',
                'Explain the key concepts',
                'Summarize the most important information',
                'What are the technical specifications?',
                'Provide an overview of the system'
            ];

            const result = await performanceValidator.validateResponseTime(testQueries, 2000);
            expect(result).toBe(true);
        }, 30000);

        it('should handle complex queries within acceptable time limits', async () => {
            const complexQueries = [
                'Analyze the relationship between different components and explain how they interact with each other in detail',
                'Compare and contrast the various approaches mentioned in the documentation and provide recommendations',
                'What are the performance implications of different configuration options and how do they affect system behavior?'
            ];

            const result = await performanceValidator.validateResponseTime(complexQueries, 5000);
            expect(result).toBe(true);
        }, 45000);
    });

    describe('Memory Usage Validation', () => {
        it('should maintain memory usage within acceptable limits', async () => {
            const result = await performanceValidator.validateMemoryUsage(512); // 512MB limit
            expect(result).toBe(true);
        }, 60000);

        it('should not have significant memory leaks during extended operation', async () => {
            // Run multiple validation cycles to check for memory leaks
            const initialMemory = process.memoryUsage().heapUsed;

            for (let i = 0; i < 3; i++) {
                await performanceValidator.validateMemoryUsage(512);

                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                }
            }

            const finalMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

            // Memory increase should be minimal (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50);
        }, 180000);
    });

    describe('Cache Effectiveness Validation', () => {
        it('should achieve minimum cache hit rate of 70%', async () => {
            const result = await performanceValidator.validateCacheEffectiveness(0.7);
            expect(result).toBe(true);
        }, 30000);

        it('should maintain cache effectiveness under load', async () => {
            // Run cache validation multiple times to ensure consistency
            const results = [];
            for (let i = 0; i < 3; i++) {
                const result = await performanceValidator.validateCacheEffectiveness(0.6);
                results.push(result);
            }

            // At least 2 out of 3 tests should pass
            const passedTests = results.filter(r => r).length;
            expect(passedTests).toBeGreaterThanOrEqual(2);
        }, 90000);
    });

    describe('Load Testing and System Validation', () => {
        it('should handle concurrent queries within performance thresholds', async () => {
            const thresholds: PerformanceThresholds = {
                maxResponseTime: 3000,    // 3 seconds max response time under load
                maxMemoryUsage: 1024,     // 1GB max memory usage
                minCacheHitRate: 0.5,     // 50% minimum cache hit rate under load
                minThroughput: 1,         // 1 request per second minimum
                maxErrorRate: 0.05        // 5% maximum error rate
            };

            const result = await performanceValidator.validateSystemUnderLoad(thresholds);
            expect(result).toBe(true);
        }, 300000); // 5 minutes timeout for load testing

        it('should maintain performance under sustained load', async () => {
            const loadTestConfig = {
                concurrentUsers: 5,
                testDuration: 60000,  // 1 minute
                rampUpTime: 10000,    // 10 seconds
                queries: [
                    'What is the main topic?',
                    'Explain the key concepts',
                    'Summarize the information',
                    'What are the technical details?'
                ]
            };

            const metrics = await performanceValidator.runLoadTest(loadTestConfig);

            // Validate key metrics
            expect(metrics.responseTime).toBeLessThan(5000); // 5 seconds max
            expect(metrics.errorRate).toBeLessThan(0.1);     // 10% max error rate
            expect(metrics.throughput).toBeGreaterThan(0.5); // 0.5 requests/sec min
            expect(metrics.memoryUsage.heapUsed / 1024 / 1024).toBeLessThan(1024); // 1GB max
        }, 120000);
    });

    describe('Resource Utilization Validation', () => {
        it('should efficiently utilize system resources', async () => {
            const initialMemory = process.memoryUsage();

            // Run a series of queries to measure resource utilization
            const queries = Array.from({ length: 20 }, (_, i) =>
                `Test query ${i + 1}: What information is available about topic ${i + 1}?`
            );

            const startTime = Date.now();
            const promises = queries.map(query =>
                queryProcessor.processQuery({
                    id: `resource-test-${Date.now()}-${Math.random()}`,
                    text: query,
                    timestamp: new Date()
                })
            );

            await Promise.all(promises);
            const endTime = Date.now();

            const finalMemory = process.memoryUsage();
            const processingTime = endTime - startTime;
            const memoryIncrease = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;

            // Validate resource efficiency
            expect(processingTime).toBeLessThan(30000); // 30 seconds max for 20 queries
            expect(memoryIncrease).toBeLessThan(100);   // 100MB max memory increase

            logger.info('Resource utilization test results', {
                processingTime,
                memoryIncrease,
                queriesProcessed: queries.length,
                avgTimePerQuery: processingTime / queries.length
            });
        }, 60000);

        it('should handle memory pressure gracefully', async () => {
            // Create a large number of queries to stress memory
            const largeQuerySet = Array.from({ length: 100 }, (_, i) =>
                `Complex query ${i + 1} with detailed requirements: ${'Lorem ipsum '.repeat(50)
                } - What are the implications and detailed analysis?`
            );

            let successfulQueries = 0;
            let failedQueries = 0;

            for (const query of largeQuerySet) {
                try {
                    await queryProcessor.processQuery({
                        id: `memory-pressure-test-${Date.now()}-${Math.random()}`,
                        text: query,
                        timestamp: new Date()
                    });
                    successfulQueries++;
                } catch (error) {
                    failedQueries++;
                    logger.debug('Query failed under memory pressure', {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            const successRate = successfulQueries / (successfulQueries + failedQueries);

            // Should handle at least 80% of queries successfully even under memory pressure
            expect(successRate).toBeGreaterThan(0.8);

            logger.info('Memory pressure test results', {
                successfulQueries,
                failedQueries,
                successRate,
                totalQueries: largeQuerySet.length
            });
        }, 180000);
    });
});