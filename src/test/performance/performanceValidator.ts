import { performance } from 'perf_hooks';
import { SystemConfig } from '../../models/config';
import { CacheManager } from '../../services/cache';
import { DataSourceManager } from '../../services/dataSourceManager';
import { QueryProcessor } from '../../services/queryProcessor';
import { logger } from '../../utils/logger';

export interface PerformanceMetrics {
    responseTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cacheHitRate: number;
    throughput: number;
    errorRate: number;
}

export interface PerformanceThresholds {
    maxResponseTime: number;
    maxMemoryUsage: number;
    minCacheHitRate: number;
    minThroughput: number;
    maxErrorRate: number;
}

export interface LoadTestConfig {
    concurrentUsers: number;
    testDuration: number;
    rampUpTime: number;
    queries: string[];
}

export class PerformanceValidator {
    private queryProcessor: QueryProcessor;
    private cacheManager: CacheManager;
    // private dataSourceManager: DataSourceManager;
    // private config: SystemConfig;

    constructor(
        queryProcessor: QueryProcessor,
        cacheManager: CacheManager,
        _dataSourceManager: DataSourceManager,
        _config: SystemConfig
    ) {
        this.queryProcessor = queryProcessor;
        this.cacheManager = cacheManager;
        // this.dataSourceManager = dataSourceManager;
        // this.config = config;
    }

    /**
     * Validate response time requirements (< 2 seconds for typical queries)
     */
    async validateResponseTime(queries: string[], threshold: number = 2000): Promise<boolean> {
        logger.info('Starting response time validation', { threshold, queryCount: queries.length });

        const results: number[] = [];

        for (const query of queries) {
            const startTime = performance.now();

            try {
                await this.queryProcessor.processQuery({
                    id: `perf-test-${Date.now()}`,
                    text: query,
                    timestamp: new Date()
                });

                const responseTime = performance.now() - startTime;
                results.push(responseTime);

                logger.debug('Query response time measured', {
                    query: query.substring(0, 50),
                    responseTime
                });
            } catch (error) {
                logger.error('Query failed during response time validation', {
                    query: query.substring(0, 50),
                    error: error instanceof Error ? error.message : String(error)
                });
                return false;
            }
        }

        const avgResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;
        const maxResponseTime = Math.max(...results);
        const p95ResponseTime = this.calculatePercentile(results, 95);

        logger.info('Response time validation results', {
            avgResponseTime,
            maxResponseTime,
            p95ResponseTime,
            threshold,
            passed: maxResponseTime <= threshold
        });

        return maxResponseTime <= threshold;
    }

    /**
     * Validate memory usage and resource utilization
     */
    async validateMemoryUsage(maxMemoryMB: number = 512): Promise<boolean> {
        logger.info('Starting memory usage validation', { maxMemoryMB });

        // Force garbage collection if available
        if (global.gc) {
            global.gc();
        }

        const initialMemory = process.memoryUsage();

        // Run a series of queries to stress memory
        const testQueries = [
            'What is the main topic of the documents?',
            'Explain the key concepts in detail',
            'Summarize the most important information',
            'What are the technical specifications?',
            'Provide an overview of the system architecture'
        ];

        for (let i = 0; i < 10; i++) {
            for (const query of testQueries) {
                try {
                    await this.queryProcessor.processQuery({
                        id: `memory-test-${i}-${Date.now()}`,
                        text: query,
                        timestamp: new Date()
                    });
                } catch (error) {
                    logger.warn('Query failed during memory test', {
                        iteration: i,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }

        const finalMemory = process.memoryUsage();
        const memoryIncreaseMB = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
        const totalMemoryMB = finalMemory.heapUsed / 1024 / 1024;

        logger.info('Memory usage validation results', {
            initialMemoryMB: initialMemory.heapUsed / 1024 / 1024,
            finalMemoryMB: totalMemoryMB,
            memoryIncreaseMB,
            maxMemoryMB,
            passed: totalMemoryMB <= maxMemoryMB
        });

        return totalMemoryMB <= maxMemoryMB;
    }

    /**
     * Validate cache effectiveness and hit rate
     */
    async validateCacheEffectiveness(minHitRate: number = 0.7): Promise<boolean> {
        logger.info('Starting cache effectiveness validation', { minHitRate });

        // Clear cache to start fresh
        await this.cacheManager.clearAllCache();

        const testQuery = 'What is the main topic of the documents?';

        // First query - should be a cache miss
        await this.queryProcessor.processQuery({
            id: `cache-test-1-${Date.now()}`,
            text: testQuery,
            timestamp: new Date()
        });

        // Subsequent queries - should be cache hits
        const cacheTestPromises = [];
        for (let i = 0; i < 10; i++) {
            cacheTestPromises.push(
                this.queryProcessor.processQuery({
                    id: `cache-test-${i + 2}-${Date.now()}`,
                    text: testQuery,
                    timestamp: new Date()
                })
            );
        }

        await Promise.all(cacheTestPromises);

        const cacheStats = await this.cacheManager.getStats();
        const hitRate = cacheStats.hits / (cacheStats.hits + cacheStats.misses);

        logger.info('Cache effectiveness validation results', {
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            hitRate,
            minHitRate,
            passed: hitRate >= minHitRate
        });

        return hitRate >= minHitRate;
    }

    /**
     * Run load testing with concurrent queries
     */
    async runLoadTest(config: LoadTestConfig): Promise<PerformanceMetrics> {
        logger.info('Starting load test', config);

        const startTime = Date.now();
        const results: { success: boolean; responseTime: number }[] = [];
        const activeRequests = new Set<Promise<void>>();

        // Ramp up users gradually
        const rampUpInterval = config.rampUpTime / config.concurrentUsers;

        for (let user = 0; user < config.concurrentUsers; user++) {
            setTimeout(() => {
                const userPromise = this.simulateUser(config.queries, config.testDuration, results);
                activeRequests.add(userPromise);
                userPromise.finally(() => activeRequests.delete(userPromise));
            }, user * rampUpInterval);
        }

        // Wait for test duration
        await new Promise(resolve => setTimeout(resolve, config.testDuration + config.rampUpTime));

        // Wait for all active requests to complete
        await Promise.all(Array.from(activeRequests));

        const endTime = Date.now();
        const totalTime = endTime - startTime;

        // Calculate metrics
        const successfulRequests = results.filter(r => r.success);
        const failedRequests = results.filter(r => !r.success);

        const avgResponseTime = successfulRequests.length > 0
            ? successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length
            : 0;

        const throughput = (results.length / totalTime) * 1000; // requests per second
        const errorRate = failedRequests.length / results.length;

        const cacheStats = await this.cacheManager.getStats();
        const cacheHitRate = cacheStats.hits / (cacheStats.hits + cacheStats.misses);

        const metrics: PerformanceMetrics = {
            responseTime: avgResponseTime,
            memoryUsage: process.memoryUsage(),
            cacheHitRate,
            throughput,
            errorRate
        };

        logger.info('Load test completed', {
            ...metrics,
            totalRequests: results.length,
            successfulRequests: successfulRequests.length,
            failedRequests: failedRequests.length,
            testDuration: totalTime
        });

        return metrics;
    }

    /**
     * Validate system behavior under various load conditions
     */
    async validateSystemUnderLoad(thresholds: PerformanceThresholds): Promise<boolean> {
        logger.info('Starting system validation under load', thresholds);

        const loadConfigs: LoadTestConfig[] = [
            {
                concurrentUsers: 5,
                testDuration: 30000, // 30 seconds
                rampUpTime: 5000,    // 5 seconds
                queries: [
                    'What is the main topic?',
                    'Explain the key concepts',
                    'Summarize the information'
                ]
            },
            {
                concurrentUsers: 10,
                testDuration: 60000, // 1 minute
                rampUpTime: 10000,   // 10 seconds
                queries: [
                    'What is the main topic?',
                    'Explain the key concepts',
                    'Summarize the information',
                    'What are the technical details?',
                    'Provide an overview'
                ]
            }
        ];

        for (const config of loadConfigs) {
            logger.info('Running load test configuration', {
                concurrentUsers: config.concurrentUsers,
                testDuration: config.testDuration
            });

            const metrics = await this.runLoadTest(config);

            // Validate against thresholds
            const validations = [
                { name: 'Response Time', value: metrics.responseTime, threshold: thresholds.maxResponseTime, passed: metrics.responseTime <= thresholds.maxResponseTime },
                { name: 'Memory Usage', value: metrics.memoryUsage.heapUsed / 1024 / 1024, threshold: thresholds.maxMemoryUsage, passed: (metrics.memoryUsage.heapUsed / 1024 / 1024) <= thresholds.maxMemoryUsage },
                { name: 'Cache Hit Rate', value: metrics.cacheHitRate, threshold: thresholds.minCacheHitRate, passed: metrics.cacheHitRate >= thresholds.minCacheHitRate },
                { name: 'Throughput', value: metrics.throughput, threshold: thresholds.minThroughput, passed: metrics.throughput >= thresholds.minThroughput },
                { name: 'Error Rate', value: metrics.errorRate, threshold: thresholds.maxErrorRate, passed: metrics.errorRate <= thresholds.maxErrorRate }
            ];

            const failedValidations = validations.filter(v => !v.passed);

            if (failedValidations.length > 0) {
                logger.error('Performance validation failed', {
                    concurrentUsers: config.concurrentUsers,
                    failedValidations
                });
                return false;
            }

            logger.info('Load test configuration passed', {
                concurrentUsers: config.concurrentUsers,
                validations
            });
        }

        logger.info('System validation under load completed successfully');
        return true;
    }

    private async simulateUser(
        queries: string[],
        duration: number,
        results: { success: boolean; responseTime: number }[]
    ): Promise<void> {
        const endTime = Date.now() + duration;

        while (Date.now() < endTime) {
            const query = queries[Math.floor(Math.random() * queries.length)];
            if (!query) continue;

            const startTime = performance.now();

            try {
                await this.queryProcessor.processQuery({
                    id: `load-test-${Date.now()}-${Math.random()}`,
                    text: query,
                    timestamp: new Date()
                });

                const responseTime = performance.now() - startTime;
                results.push({ success: true, responseTime });
            } catch (error) {
                const responseTime = performance.now() - startTime;
                results.push({ success: false, responseTime });

                logger.debug('Query failed during load test', {
                    query: query.substring(0, 50),
                    error: error instanceof Error ? error.message : String(error)
                });
            }

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        }
    }

    private calculatePercentile(values: number[], percentile: number): number {
        if (values.length === 0) return 0;

        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))] || 0;
    }
}