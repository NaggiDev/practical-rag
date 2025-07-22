#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
const configManager_1 = require("../config/configManager");
const cache_1 = require("../services/cache");
const embedding_1 = require("../services/embedding");
const queryProcessor_1 = require("../services/queryProcessor");
const vectorSearch_1 = require("../services/vectorSearch");
const benchmarkRunner_1 = require("../test/performance/benchmarkRunner");
const performanceValidator_1 = require("../test/performance/performanceValidator");
const logger_1 = require("../utils/logger");
class PerformanceTestRunner {
    constructor() {
        this.performanceConfig = {
            responseTimeThreshold: 2000,
            memoryLimitMB: 512,
            cacheHitRateThreshold: 0.7,
            loadTestThresholds: {
                maxResponseTime: 3000,
                maxMemoryUsage: 1024,
                minCacheHitRate: 0.5,
                minThroughput: 1,
                maxErrorRate: 0.05
            },
            benchmarkEnabled: true,
            outputDir: './performance-results'
        };
    }
    async initialize() {
        logger_1.logger.info('Initializing performance test environment');
        const configManager = configManager_1.EnhancedConfigManager.getInstance();
        this.config = await configManager.loadConfig({
            environment: process.env.NODE_ENV || 'test'
        });
        this.cacheManager = new cache_1.CacheManager(this.config.cache);
        const embeddingConfig = {
            provider: 'local',
            model: this.config.embedding.model,
            batchSize: this.config.embedding.batchSize
        };
        this.embeddingService = new embedding_1.EmbeddingService(embeddingConfig);
        const vectorConfig = {
            provider: 'faiss',
            dimension: this.config.database.vector.dimension,
            indexType: 'flat',
            connectionString: this.config.database.vector.connectionString
        };
        this.vectorDatabase = new vectorSearch_1.VectorDatabase(vectorConfig);
        this.dataSourceManager = {
            addDataSource: async () => { },
            getDataSources: async () => [],
            removeDataSource: async () => { },
            syncDataSource: async () => { },
            searchDataSources: async () => []
        };
        this.queryProcessor = new queryProcessor_1.QueryProcessor({
            maxConcurrentQueries: 10,
            defaultTimeout: 30000,
            enableParallelSearch: true,
            cacheEnabled: true,
            minConfidenceThreshold: 0.7,
            maxResultsPerSource: 10
        }, this.cacheManager, this.vectorDatabase, this.embeddingService, this.dataSourceManager);
        this.performanceValidator = new performanceValidator_1.PerformanceValidator(this.queryProcessor, this.cacheManager, this.dataSourceManager, this.config);
        this.benchmarkRunner = new benchmarkRunner_1.BenchmarkRunner(this.queryProcessor, this.cacheManager, this.dataSourceManager, this.config);
        await fs.mkdir(this.performanceConfig.outputDir, { recursive: true });
        logger_1.logger.info('Performance test environment initialized');
    }
    async runAllTests() {
        logger_1.logger.info('Starting comprehensive performance test suite');
        const results = {
            timestamp: new Date().toISOString(),
            responseTimeValidation: false,
            memoryUsageValidation: false,
            cacheEffectivenessValidation: false,
            loadTestValidation: false,
            benchmarkResults: null,
            summary: {
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                overallResult: 'FAILED'
            }
        };
        try {
            logger_1.logger.info('Running response time validation');
            results.responseTimeValidation = await this.runResponseTimeValidation();
            results.summary.totalTests++;
            if (results.responseTimeValidation)
                results.summary.passedTests++;
            logger_1.logger.info('Running memory usage validation');
            results.memoryUsageValidation = await this.runMemoryUsageValidation();
            results.summary.totalTests++;
            if (results.memoryUsageValidation)
                results.summary.passedTests++;
            logger_1.logger.info('Running cache effectiveness validation');
            results.cacheEffectivenessValidation = await this.runCacheEffectivenessValidation();
            results.summary.totalTests++;
            if (results.cacheEffectivenessValidation)
                results.summary.passedTests++;
            logger_1.logger.info('Running load test validation');
            results.loadTestValidation = await this.runLoadTestValidation();
            results.summary.totalTests++;
            if (results.loadTestValidation)
                results.summary.passedTests++;
            if (this.performanceConfig.benchmarkEnabled) {
                logger_1.logger.info('Running benchmark tests');
                results.benchmarkResults = await this.runBenchmarkTests();
            }
            results.summary.failedTests = results.summary.totalTests - results.summary.passedTests;
            results.summary.overallResult = results.summary.failedTests === 0 ? 'PASSED' : 'FAILED';
            await this.saveResults(results);
            await this.generateReport(results);
            logger_1.logger.info('Performance test suite completed', results.summary);
        }
        catch (error) {
            logger_1.logger.error('Performance test suite failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async runResponseTimeValidation() {
        const testQueries = [
            'What is the main topic of the documents?',
            'Explain the key concepts in detail',
            'Summarize the most important information',
            'What are the technical specifications?',
            'Provide an overview of the system architecture'
        ];
        return await this.performanceValidator.validateResponseTime(testQueries, this.performanceConfig.responseTimeThreshold);
    }
    async runMemoryUsageValidation() {
        return await this.performanceValidator.validateMemoryUsage(this.performanceConfig.memoryLimitMB);
    }
    async runCacheEffectivenessValidation() {
        return await this.performanceValidator.validateCacheEffectiveness(this.performanceConfig.cacheHitRateThreshold);
    }
    async runLoadTestValidation() {
        return await this.performanceValidator.validateSystemUnderLoad(this.performanceConfig.loadTestThresholds);
    }
    async runBenchmarkTests() {
        const benchmarkResults = await this.benchmarkRunner.runBenchmarkSuite();
        const report = this.benchmarkRunner.generatePerformanceReport(benchmarkResults);
        const reportPath = path.join(this.performanceConfig.outputDir, 'benchmark-report.md');
        await fs.writeFile(reportPath, report, 'utf-8');
        return benchmarkResults;
    }
    async saveResults(results) {
        const resultsPath = path.join(this.performanceConfig.outputDir, 'performance-results.json');
        await fs.writeFile(resultsPath, JSON.stringify(results, null, 2), 'utf-8');
        logger_1.logger.info(`Performance results saved to: ${resultsPath}`);
    }
    async generateReport(results) {
        let report = '# Performance Test Report\n\n';
        report += `**Generated:** ${results.timestamp}\n\n`;
        report += `**Overall Result:** ${results.summary.overallResult}\n\n`;
        report += '## Summary\n\n';
        report += `- **Total Tests:** ${results.summary.totalTests}\n`;
        report += `- **Passed Tests:** ${results.summary.passedTests}\n`;
        report += `- **Failed Tests:** ${results.summary.failedTests}\n`;
        report += `- **Success Rate:** ${((results.summary.passedTests / results.summary.totalTests) * 100).toFixed(1)}%\n\n`;
        report += '## Test Results\n\n';
        report += `- **Response Time Validation:** ${results.responseTimeValidation ? '✅ PASSED' : '❌ FAILED'}\n`;
        report += `- **Memory Usage Validation:** ${results.memoryUsageValidation ? '✅ PASSED' : '❌ FAILED'}\n`;
        report += `- **Cache Effectiveness Validation:** ${results.cacheEffectivenessValidation ? '✅ PASSED' : '❌ FAILED'}\n`;
        report += `- **Load Test Validation:** ${results.loadTestValidation ? '✅ PASSED' : '❌ FAILED'}\n\n`;
        report += '## Test Configuration\n\n';
        report += `- **Response Time Threshold:** ${this.performanceConfig.responseTimeThreshold}ms\n`;
        report += `- **Memory Limit:** ${this.performanceConfig.memoryLimitMB}MB\n`;
        report += `- **Cache Hit Rate Threshold:** ${(this.performanceConfig.cacheHitRateThreshold * 100).toFixed(1)}%\n`;
        report += `- **Load Test Max Response Time:** ${this.performanceConfig.loadTestThresholds.maxResponseTime}ms\n`;
        report += `- **Load Test Max Memory Usage:** ${this.performanceConfig.loadTestThresholds.maxMemoryUsage}MB\n`;
        report += `- **Load Test Min Cache Hit Rate:** ${(this.performanceConfig.loadTestThresholds.minCacheHitRate * 100).toFixed(1)}%\n`;
        report += `- **Load Test Min Throughput:** ${this.performanceConfig.loadTestThresholds.minThroughput} req/s\n`;
        report += `- **Load Test Max Error Rate:** ${(this.performanceConfig.loadTestThresholds.maxErrorRate * 100).toFixed(1)}%\n\n`;
        report += '## Recommendations\n\n';
        if (!results.responseTimeValidation) {
            report += '- ⚠️ Response time validation failed. Consider optimizing query processing, adding more caching, or scaling resources.\n';
        }
        if (!results.memoryUsageValidation) {
            report += '- ⚠️ Memory usage validation failed. Check for memory leaks and optimize memory usage patterns.\n';
        }
        if (!results.cacheEffectivenessValidation) {
            report += '- ⚠️ Cache effectiveness validation failed. Review caching strategy, TTL settings, and cache invalidation logic.\n';
        }
        if (!results.loadTestValidation) {
            report += '- ⚠️ Load test validation failed. System may not handle concurrent load well. Consider scaling or performance optimizations.\n';
        }
        if (results.summary.overallResult === 'PASSED') {
            report += '- ✅ All performance tests passed. System meets performance requirements.\n';
        }
        const reportPath = path.join(this.performanceConfig.outputDir, 'performance-report.md');
        await fs.writeFile(reportPath, report, 'utf-8');
        logger_1.logger.info(`Performance report saved to: ${reportPath}`);
    }
    async cleanup() {
        logger_1.logger.info('Cleaning up performance test environment');
        try {
            if (this.cacheManager && typeof this.cacheManager.close === 'function') {
                await this.cacheManager.close();
            }
            if (this.vectorDatabase && typeof this.vectorDatabase.close === 'function') {
                await this.vectorDatabase.close();
            }
        }
        catch (error) {
            logger_1.logger.warn('Error during cleanup', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}
async function main() {
    const runner = new PerformanceTestRunner();
    try {
        await runner.initialize();
        await runner.runAllTests();
        console.log('\n✅ Performance tests completed successfully!');
        console.log('📊 Check the performance-results directory for detailed reports.');
        process.exit(0);
    }
    catch (error) {
        console.error('\n❌ Performance tests failed:', error);
        process.exit(1);
    }
    finally {
        await runner.cleanup();
    }
}
process.on('SIGINT', async () => {
    console.log('\n🛑 Performance tests interrupted');
    process.exit(1);
});
process.on('SIGTERM', async () => {
    console.log('\n🛑 Performance tests terminated');
    process.exit(1);
});
if (require.main === module) {
    main().catch(console.error);
}
//# sourceMappingURL=runPerformanceTests.js.map