"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BenchmarkRunner = void 0;
const perf_hooks_1 = require("perf_hooks");
const logger_1 = require("../../utils/logger");
class BenchmarkRunner {
    constructor(queryProcessor, cacheManager, _dataSourceManager, _config) {
        this.queryProcessor = queryProcessor;
        this.cacheManager = cacheManager;
    }
    async runBenchmarkSuite() {
        logger_1.logger.info('Starting comprehensive benchmark suite');
        const benchmarkConfigs = [
            {
                name: 'Single Query Performance',
                queries: ['What is the main topic of the documents?'],
                iterations: 100,
                concurrency: 1,
                warmupIterations: 10
            },
            {
                name: 'Varied Query Performance',
                queries: [
                    'What is the main topic?',
                    'Explain the key concepts',
                    'Summarize the information',
                    'What are the technical details?',
                    'Provide an overview'
                ],
                iterations: 50,
                concurrency: 1,
                warmupIterations: 5
            },
            {
                name: 'Concurrent Query Performance',
                queries: [
                    'What is the main topic?',
                    'Explain the key concepts',
                    'Summarize the information'
                ],
                iterations: 30,
                concurrency: 5,
                warmupIterations: 5
            },
            {
                name: 'High Concurrency Performance',
                queries: [
                    'What is the main topic?',
                    'Explain the key concepts'
                ],
                iterations: 20,
                concurrency: 10,
                warmupIterations: 3
            },
            {
                name: 'Complex Query Performance',
                queries: [
                    'Analyze the relationship between different components and explain how they interact with each other in detail',
                    'Compare and contrast the various approaches mentioned in the documentation and provide comprehensive recommendations',
                    'What are the performance implications of different configuration options and how do they affect overall system behavior and scalability?'
                ],
                iterations: 20,
                concurrency: 2,
                warmupIterations: 2
            }
        ];
        const results = [];
        for (const config of benchmarkConfigs) {
            logger_1.logger.info(`Running benchmark: ${config.name}`);
            const result = await this.runBenchmark(config);
            results.push(result);
            if (config.cooldownTime) {
                await new Promise(resolve => setTimeout(resolve, config.cooldownTime));
            }
            else {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        logger_1.logger.info('Benchmark suite completed', {
            totalBenchmarks: results.length,
            results: results.map(r => ({
                name: r.testName,
                avgResponseTime: r.avgResponseTime,
                throughput: r.throughput,
                errorRate: r.errorRate
            }))
        });
        return results;
    }
    async runBenchmark(config) {
        logger_1.logger.info(`Starting benchmark: ${config.name}`, config);
        if (config.warmupIterations && config.warmupIterations > 0) {
            logger_1.logger.debug('Running warmup iterations', { warmupIterations: config.warmupIterations });
            await this.runWarmup(config.queries, config.warmupIterations, config.concurrency);
        }
        await this.cacheManager.clearAllCache();
        const startTime = perf_hooks_1.performance.now();
        const initialCacheStats = await this.cacheManager.getStats();
        const results = [];
        if (config.concurrency === 1) {
            for (let i = 0; i < config.iterations; i++) {
                const query = config.queries[i % config.queries.length];
                if (query) {
                    const result = await this.executeQuery(query, `${config.name}-${i}`);
                    results.push(result);
                }
            }
        }
        else {
            const batches = Math.ceil(config.iterations / config.concurrency);
            for (let batch = 0; batch < batches; batch++) {
                const batchPromises = [];
                for (let i = 0; i < config.concurrency && (batch * config.concurrency + i) < config.iterations; i++) {
                    const queryIndex = (batch * config.concurrency + i) % config.queries.length;
                    const query = config.queries[queryIndex];
                    if (query) {
                        batchPromises.push(this.executeQuery(query, `${config.name}-${batch}-${i}`));
                    }
                }
                const batchResults = await Promise.all(batchPromises);
                results.push(...batchResults);
            }
        }
        const endTime = perf_hooks_1.performance.now();
        const finalMemory = process.memoryUsage();
        const finalCacheStats = await this.cacheManager.getStats();
        const testDuration = endTime - startTime;
        const successfulResults = results.filter(r => r.success);
        const failedResults = results.filter(r => !r.success);
        const responseTimes = successfulResults.map(r => r.responseTime);
        const avgResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
            : 0;
        const sortedResponseTimes = responseTimes.slice().sort((a, b) => a - b);
        const throughput = (results.length / testDuration) * 1000;
        const errorRate = failedResults.length / results.length;
        const cacheHits = finalCacheStats.hits - initialCacheStats.hits;
        const cacheMisses = finalCacheStats.misses - initialCacheStats.misses;
        const cacheHitRate = (cacheHits + cacheMisses) > 0 ? cacheHits / (cacheHits + cacheMisses) : 0;
        const benchmarkResult = {
            testName: config.name,
            totalQueries: results.length,
            successfulQueries: successfulResults.length,
            failedQueries: failedResults.length,
            avgResponseTime,
            minResponseTime: sortedResponseTimes.length > 0 ? sortedResponseTimes[0] : 0,
            maxResponseTime: sortedResponseTimes.length > 0 ? sortedResponseTimes[sortedResponseTimes.length - 1] : 0,
            p50ResponseTime: this.calculatePercentile(sortedResponseTimes, 50),
            p95ResponseTime: this.calculatePercentile(sortedResponseTimes, 95),
            p99ResponseTime: this.calculatePercentile(sortedResponseTimes, 99),
            throughput,
            errorRate,
            memoryUsage: finalMemory,
            cacheHitRate,
            testDuration
        };
        logger_1.logger.info(`Benchmark completed: ${config.name}`, benchmarkResult);
        return benchmarkResult;
    }
    generatePerformanceReport(results) {
        let report = '# Performance Benchmark Report\n\n';
        report += `Generated: ${new Date().toISOString()}\n\n`;
        report += '## Summary\n\n';
        report += '| Test Name | Avg Response Time (ms) | Throughput (req/s) | Error Rate (%) | Cache Hit Rate (%) |\n';
        report += '|-----------|------------------------|-------------------|----------------|--------------------|\n';
        for (const result of results) {
            report += `| ${result.testName} | ${result.avgResponseTime.toFixed(2)} | ${result.throughput.toFixed(2)} | ${(result.errorRate * 100).toFixed(2)} | ${(result.cacheHitRate * 100).toFixed(2)} |\n`;
        }
        report += '\n';
        report += '## Detailed Results\n\n';
        for (const result of results) {
            report += `### ${result.testName}\n\n`;
            report += `- **Total Queries**: ${result.totalQueries}\n`;
            report += `- **Successful Queries**: ${result.successfulQueries}\n`;
            report += `- **Failed Queries**: ${result.failedQueries}\n`;
            report += `- **Test Duration**: ${result.testDuration.toFixed(2)} ms\n`;
            report += `- **Average Response Time**: ${result.avgResponseTime.toFixed(2)} ms\n`;
            report += `- **Min Response Time**: ${result.minResponseTime.toFixed(2)} ms\n`;
            report += `- **Max Response Time**: ${result.maxResponseTime.toFixed(2)} ms\n`;
            report += `- **P50 Response Time**: ${result.p50ResponseTime.toFixed(2)} ms\n`;
            report += `- **P95 Response Time**: ${result.p95ResponseTime.toFixed(2)} ms\n`;
            report += `- **P99 Response Time**: ${result.p99ResponseTime.toFixed(2)} ms\n`;
            report += `- **Throughput**: ${result.throughput.toFixed(2)} requests/second\n`;
            report += `- **Error Rate**: ${(result.errorRate * 100).toFixed(2)}%\n`;
            report += `- **Cache Hit Rate**: ${(result.cacheHitRate * 100).toFixed(2)}%\n`;
            report += `- **Memory Usage**: ${(result.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n\n`;
        }
        report += '## Performance Analysis\n\n';
        const avgResponseTime = results.reduce((sum, r) => sum + r.avgResponseTime, 0) / results.length;
        const avgThroughput = results.reduce((sum, r) => sum + r.throughput, 0) / results.length;
        const avgErrorRate = results.reduce((sum, r) => sum + r.errorRate, 0) / results.length;
        const avgCacheHitRate = results.reduce((sum, r) => sum + r.cacheHitRate, 0) / results.length;
        report += `- **Overall Average Response Time**: ${avgResponseTime.toFixed(2)} ms\n`;
        report += `- **Overall Average Throughput**: ${avgThroughput.toFixed(2)} requests/second\n`;
        report += `- **Overall Average Error Rate**: ${(avgErrorRate * 100).toFixed(2)}%\n`;
        report += `- **Overall Average Cache Hit Rate**: ${(avgCacheHitRate * 100).toFixed(2)}%\n\n`;
        report += '## Recommendations\n\n';
        if (avgResponseTime > 2000) {
            report += '- ⚠️ Average response time exceeds 2 seconds. Consider optimizing query processing or adding more caching.\n';
        }
        if (avgErrorRate > 0.05) {
            report += '- ⚠️ Error rate exceeds 5%. Investigate error causes and improve error handling.\n';
        }
        if (avgCacheHitRate < 0.5) {
            report += '- ⚠️ Cache hit rate is below 50%. Review caching strategy and TTL settings.\n';
        }
        if (avgThroughput < 1) {
            report += '- ⚠️ Throughput is below 1 request/second. Consider performance optimizations.\n';
        }
        const bestPerformingTest = results.reduce((best, current) => current.avgResponseTime < best.avgResponseTime ? current : best);
        const worstPerformingTest = results.reduce((worst, current) => current.avgResponseTime > worst.avgResponseTime ? current : worst);
        report += `- ✅ Best performing test: ${bestPerformingTest.testName} (${bestPerformingTest.avgResponseTime.toFixed(2)} ms avg)\n`;
        report += `- 🔍 Worst performing test: ${worstPerformingTest.testName} (${worstPerformingTest.avgResponseTime.toFixed(2)} ms avg)\n`;
        return report;
    }
    async runWarmup(queries, iterations, concurrency) {
        const warmupPromises = [];
        for (let i = 0; i < iterations; i++) {
            const query = queries[i % queries.length];
            if (!query)
                continue;
            if (concurrency === 1) {
                await this.executeQuery(query, `warmup-${i}`);
            }
            else {
                warmupPromises.push(this.executeQuery(query, `warmup-${i}`).then(() => { }));
                if (warmupPromises.length >= concurrency) {
                    await Promise.all(warmupPromises);
                    warmupPromises.length = 0;
                }
            }
        }
        if (warmupPromises.length > 0) {
            await Promise.all(warmupPromises);
        }
    }
    async executeQuery(query, id) {
        const startTime = perf_hooks_1.performance.now();
        try {
            await this.queryProcessor.processQuery({
                id: `benchmark-${id}-${Date.now()}`,
                text: query,
                timestamp: new Date()
            });
            const responseTime = perf_hooks_1.performance.now() - startTime;
            return { success: true, responseTime };
        }
        catch (error) {
            const responseTime = perf_hooks_1.performance.now() - startTime;
            return {
                success: false,
                responseTime,
                error: error instanceof Error ? error.message : String(error)
            };
        }
    }
    calculatePercentile(values, percentile) {
        if (values.length === 0)
            return 0;
        const index = Math.ceil((percentile / 100) * values.length) - 1;
        return values[Math.max(0, Math.min(index, values.length - 1))] || 0;
    }
}
exports.BenchmarkRunner = BenchmarkRunner;
//# sourceMappingURL=benchmarkRunner.js.map