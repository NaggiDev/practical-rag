"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceValidator = void 0;
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class PerformanceValidator {
    constructor(queryProcessor, cacheManager, _dataSourceManager, _config) {
        this.queryProcessor = queryProcessor;
        this.cacheManager = cacheManager;
    }
    async validateResponseTime(queries, threshold = 2000) {
        logger_1.logger.info('Starting response time validation', { threshold, queryCount: queries.length });
        const results = [];
        for (const query of queries) {
            const startTime = perf_hooks_1.performance.now();
            try {
                await this.queryProcessor.processQuery({
                    id: `perf-test-${Date.now()}`,
                    text: query,
                    timestamp: new Date()
                });
                const responseTime = perf_hooks_1.performance.now() - startTime;
                results.push(responseTime);
                logger_1.logger.debug('Query response time measured', {
                    query: query.substring(0, 50),
                    responseTime
                });
            }
            catch (error) {
                logger_1.logger.error('Query failed during response time validation', {
                    query: query.substring(0, 50),
                    error: error instanceof Error ? error.message : String(error)
                });
                return false;
            }
        }
        const avgResponseTime = results.reduce((sum, time) => sum + time, 0) / results.length;
        const maxResponseTime = Math.max(...results);
        const p95ResponseTime = this.calculatePercentile(results, 95);
        logger_1.logger.info('Response time validation results', {
            avgResponseTime,
            maxResponseTime,
            p95ResponseTime,
            threshold,
            passed: maxResponseTime <= threshold
        });
        return maxResponseTime <= threshold;
    }
    async validateMemoryUsage(maxMemoryMB = 512) {
        logger_1.logger.info('Starting memory usage validation', { maxMemoryMB });
        if (global.gc) {
            global.gc();
        }
        const initialMemory = process.memoryUsage();
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
                }
                catch (error) {
                    logger_1.logger.warn('Query failed during memory test', {
                        iteration: i,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
        }
        const finalMemory = process.memoryUsage();
        const memoryIncreaseMB = (finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024;
        const totalMemoryMB = finalMemory.heapUsed / 1024 / 1024;
        logger_1.logger.info('Memory usage validation results', {
            initialMemoryMB: initialMemory.heapUsed / 1024 / 1024,
            finalMemoryMB: totalMemoryMB,
            memoryIncreaseMB,
            maxMemoryMB,
            passed: totalMemoryMB <= maxMemoryMB
        });
        return totalMemoryMB <= maxMemoryMB;
    }
    async validateCacheEffectiveness(minHitRate = 0.7) {
        logger_1.logger.info('Starting cache effectiveness validation', { minHitRate });
        await this.cacheManager.clearAllCache();
        const testQuery = 'What is the main topic of the documents?';
        await this.queryProcessor.processQuery({
            id: `cache-test-1-${Date.now()}`,
            text: testQuery,
            timestamp: new Date()
        });
        const cacheTestPromises = [];
        for (let i = 0; i < 10; i++) {
            cacheTestPromises.push(this.queryProcessor.processQuery({
                id: `cache-test-${i + 2}-${Date.now()}`,
                text: testQuery,
                timestamp: new Date()
            }));
        }
        await Promise.all(cacheTestPromises);
        const cacheStats = await this.cacheManager.getStats();
        const hitRate = cacheStats.hits / (cacheStats.hits + cacheStats.misses);
        logger_1.logger.info('Cache effectiveness validation results', {
            hits: cacheStats.hits,
            misses: cacheStats.misses,
            hitRate,
            minHitRate,
            passed: hitRate >= minHitRate
        });
        return hitRate >= minHitRate;
    }
    async runLoadTest(config) {
        logger_1.logger.info('Starting load test', config);
        const startTime = Date.now();
        const results = [];
        const activeRequests = new Set();
        const rampUpInterval = config.rampUpTime / config.concurrentUsers;
        for (let user = 0; user < config.concurrentUsers; user++) {
            setTimeout(() => {
                const userPromise = this.simulateUser(config.queries, config.testDuration, results);
                activeRequests.add(userPromise);
                userPromise.finally(() => activeRequests.delete(userPromise));
            }, user * rampUpInterval);
        }
        await new Promise(resolve => setTimeout(resolve, config.testDuration + config.rampUpTime));
        await Promise.all(Array.from(activeRequests));
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        const successfulRequests = results.filter(r => r.success);
        const failedRequests = results.filter(r => !r.success);
        const avgResponseTime = successfulRequests.length > 0
            ? successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) / successfulRequests.length
            : 0;
        const throughput = (results.length / totalTime) * 1000;
        const errorRate = failedRequests.length / results.length;
        const cacheStats = await this.cacheManager.getStats();
        const cacheHitRate = cacheStats.hits / (cacheStats.hits + cacheStats.misses);
        const metrics = {
            responseTime: avgResponseTime,
            memoryUsage: process.memoryUsage(),
            cacheHitRate,
            throughput,
            errorRate
        };
        logger_1.logger.info('Load test completed', {
            ...metrics,
            totalRequests: results.length,
            successfulRequests: successfulRequests.length,
            failedRequests: failedRequests.length,
            testDuration: totalTime
        });
        return metrics;
    }
    async validateSystemUnderLoad(thresholds) {
        logger_1.logger.info('Starting system validation under load', thresholds);
        const loadConfigs = [
            {
                concurrentUsers: 5,
                testDuration: 30000,
                rampUpTime: 5000,
                queries: [
                    'What is the main topic?',
                    'Explain the key concepts',
                    'Summarize the information'
                ]
            },
            {
                concurrentUsers: 10,
                testDuration: 60000,
                rampUpTime: 10000,
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
            logger_1.logger.info('Running load test configuration', {
                concurrentUsers: config.concurrentUsers,
                testDuration: config.testDuration
            });
            const metrics = await this.runLoadTest(config);
            const validations = [
                { name: 'Response Time', value: metrics.responseTime, threshold: thresholds.maxResponseTime, passed: metrics.responseTime <= thresholds.maxResponseTime },
                { name: 'Memory Usage', value: metrics.memoryUsage.heapUsed / 1024 / 1024, threshold: thresholds.maxMemoryUsage, passed: (metrics.memoryUsage.heapUsed / 1024 / 1024) <= thresholds.maxMemoryUsage },
                { name: 'Cache Hit Rate', value: metrics.cacheHitRate, threshold: thresholds.minCacheHitRate, passed: metrics.cacheHitRate >= thresholds.minCacheHitRate },
                { name: 'Throughput', value: metrics.throughput, threshold: thresholds.minThroughput, passed: metrics.throughput >= thresholds.minThroughput },
                { name: 'Error Rate', value: metrics.errorRate, threshold: thresholds.maxErrorRate, passed: metrics.errorRate <= thresholds.maxErrorRate }
            ];
            const failedValidations = validations.filter(v => !v.passed);
            if (failedValidations.length > 0) {
                logger_1.logger.error('Performance validation failed', {
                    concurrentUsers: config.concurrentUsers,
                    failedValidations
                });
                return false;
            }
            logger_1.logger.info('Load test configuration passed', {
                concurrentUsers: config.concurrentUsers,
                validations
            });
        }
        logger_1.logger.info('System validation under load completed successfully');
        return true;
    }
    async simulateUser(queries, duration, results) {
        const endTime = Date.now() + duration;
        while (Date.now() < endTime) {
            const query = queries[Math.floor(Math.random() * queries.length)];
            if (!query)
                continue;
            const startTime = perf_hooks_1.performance.now();
            try {
                await this.queryProcessor.processQuery({
                    id: `load-test-${Date.now()}-${Math.random()}`,
                    text: query,
                    timestamp: new Date()
                });
                const responseTime = perf_hooks_1.performance.now() - startTime;
                results.push({ success: true, responseTime });
            }
            catch (error) {
                const responseTime = perf_hooks_1.performance.now() - startTime;
                results.push({ success: false, responseTime });
                logger_1.logger.debug('Query failed during load test', {
                    query: query.substring(0, 50),
                    error: error instanceof Error ? error.message : String(error)
                });
            }
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        }
    }
    calculatePercentile(values, percentile) {
        if (values.length === 0)
            return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        const index = Math.ceil((percentile / 100) * sorted.length) - 1;
        return sorted[Math.max(0, Math.min(index, sorted.length - 1))] || 0;
    }
}
exports.PerformanceValidator = PerformanceValidator;
//# sourceMappingURL=performanceValidator.js.map