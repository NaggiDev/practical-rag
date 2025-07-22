#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import { EnhancedConfigManager } from '../config/configManager';
import { SystemConfig } from '../models/config';
import { CacheManager } from '../services/cache';
import { DataSourceManager } from '../services/dataSourceManager';
import { EmbeddingService } from '../services/embedding';
import { QueryProcessor } from '../services/queryProcessor';
import { VectorDatabase } from '../services/vectorSearch';
import { BenchmarkRunner } from '../test/performance/benchmarkRunner';
import { PerformanceThresholds, PerformanceValidator } from '../test/performance/performanceValidator';
import { logger } from '../utils/logger';

interface PerformanceTestConfig {
    responseTimeThreshold: number;
    memoryLimitMB: number;
    cacheHitRateThreshold: number;
    loadTestThresholds: PerformanceThresholds;
    benchmarkEnabled: boolean;
    outputDir: string;
}

class PerformanceTestRunner {
    private config!: SystemConfig;
    private performanceConfig: PerformanceTestConfig;
    private queryProcessor!: QueryProcessor;
    private cacheManager!: CacheManager;
    private dataSourceManager!: DataSourceManager;
    private embeddingService!: EmbeddingService;
    private vectorDatabase!: VectorDatabase;
    private performanceValidator!: PerformanceValidator;
    private benchmarkRunner!: BenchmarkRunner;

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

    async initialize(): Promise<void> {
        logger.info('Initializing performance test environment');

        // Load system configuration
        const configManager = EnhancedConfigManager.getInstance();
        this.config = await configManager.loadConfig({
            environment: process.env.NODE_ENV as 'development' | 'production' | 'test' || 'test'
        });

        // Initialize services
        this.cacheManager = new CacheManager(this.config.cache);

        // Create a compatible embedding config
        const embeddingConfig = {
            provider: 'local' as const,
            model: this.config.embedding.model,
            batchSize: this.config.embedding.batchSize
        };
        this.embeddingService = new EmbeddingService(embeddingConfig);

        // Create a compatible vector database config
        const vectorConfig = {
            provider: 'faiss' as const,
            dimension: this.config.database.vector.dimension,
            indexType: 'flat' as const,
            connectionString: this.config.database.vector.connectionString
        };
        this.vectorDatabase = new VectorDatabase(vectorConfig);

        // Note: DataSourceManager is an interface, we'll create a mock implementation
        this.dataSourceManager = {
            addDataSource: async () => { },
            getDataSources: async () => [],
            removeDataSource: async () => { },
            syncDataSource: async () => { },
            searchDataSources: async () => []
        } as any;

        this.queryProcessor = new QueryProcessor({
            maxConcurrentQueries: 10,
            defaultTimeout: 30000,
            enableParallelSearch: true,
            cacheEnabled: true,
            minConfidenceThreshold: 0.7,
            maxResultsPerSource: 10
        }, this.cacheManager, this.vectorDatabase, this.embeddingService, this.dataSourceManager);

        this.performanceValidator = new PerformanceValidator(
            this.queryProcessor,
            this.cacheManager,
            this.dataSourceManager,
            this.config
        );

        this.benchmarkRunner = new BenchmarkRunner(
            this.queryProcessor,
            this.cacheManager,
            this.dataSourceManager,
            this.config
        );

        // Ensure output directory exists
        await fs.mkdir(this.performanceConfig.outputDir, { recursive: true });

        logger.info('Performance test environment initialized');
    }

    async runAllTests(): Promise<void> {
        logger.info('Starting comprehensive performance test suite');

        const results = {
            timestamp: new Date().toISOString(),
            responseTimeValidation: false,
            memoryUsageValidation: false,
            cacheEffectivenessValidation: false,
            loadTestValidation: false,
            benchmarkResults: null as any,
            summary: {
                totalTests: 0,
                passedTests: 0,
                failedTests: 0,
                overallResult: 'FAILED' as 'PASSED' | 'FAILED'
            }
        };

        try {
            // 1. Response Time Validation
            logger.info('Running response time validation');
            results.responseTimeValidation = await this.runResponseTimeValidation();
            results.summary.totalTests++;
            if (results.responseTimeValidation) results.summary.passedTests++;

            // 2. Memory Usage Validation
            logger.info('Running memory usage validation');
            results.memoryUsageValidation = await this.runMemoryUsageValidation();
            results.summary.totalTests++;
            if (results.memoryUsageValidation) results.summary.passedTests++;

            // 3. Cache Effectiveness Validation
            logger.info('Running cache effectiveness validation');
            results.cacheEffectivenessValidation = await this.runCacheEffectivenessValidation();
            results.summary.totalTests++;
            if (results.cacheEffectivenessValidation) results.summary.passedTests++;

            // 4. Load Test Validation
            logger.info('Running load test validation');
            results.loadTestValidation = await this.runLoadTestValidation();
            results.summary.totalTests++;
            if (results.loadTestValidation) results.summary.passedTests++;

            // 5. Benchmark Tests (if enabled)
            if (this.performanceConfig.benchmarkEnabled) {
                logger.info('Running benchmark tests');
                results.benchmarkResults = await this.runBenchmarkTests();
            }

            // Calculate overall result
            results.summary.failedTests = results.summary.totalTests - results.summary.passedTests;
            results.summary.overallResult = results.summary.failedTests === 0 ? 'PASSED' : 'FAILED';

            // Save results
            await this.saveResults(results);

            // Generate and save report
            await this.generateReport(results);

            logger.info('Performance test suite completed', results.summary);

        } catch (error) {
            logger.error('Performance test suite failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    private async runResponseTimeValidation(): Promise<boolean> {
        const testQueries = [
            'What is the main topic of the documents?',
            'Explain the key concepts in detail',
            'Summarize the most important information',
            'What are the technical specifications?',
            'Provide an overview of the system architecture'
        ];

        return await this.performanceValidator.validateResponseTime(
            testQueries,
            this.performanceConfig.responseTimeThreshold
        );
    }

    private async runMemoryUsageValidation(): Promise<boolean> {
        return await this.performanceValidator.validateMemoryUsage(
            this.performanceConfig.memoryLimitMB
        );
    }

    private async runCacheEffectivenessValidation(): Promise<boolean> {
        return await this.performanceValidator.validateCacheEffectiveness(
            this.performanceConfig.cacheHitRateThreshold
        );
    }

    private async runLoadTestValidation(): Promise<boolean> {
        return await this.performanceValidator.validateSystemUnderLoad(
            this.performanceConfig.loadTestThresholds
        );
    }

    private async runBenchmarkTests(): Promise<any> {
        const benchmarkResults = await this.benchmarkRunner.runBenchmarkSuite();
        const report = this.benchmarkRunner.generatePerformanceReport(benchmarkResults);

        // Save benchmark report
        const reportPath = path.join(this.performanceConfig.outputDir, 'benchmark-report.md');
        await fs.writeFile(reportPath, report, 'utf-8');

        return benchmarkResults;
    }

    private async saveResults(results: any): Promise<void> {
        const resultsPath = path.join(this.performanceConfig.outputDir, 'performance-results.json');
        await fs.writeFile(resultsPath, JSON.stringify(results, null, 2), 'utf-8');
        logger.info(`Performance results saved to: ${resultsPath}`);
    }

    private async generateReport(results: any): Promise<void> {
        let report = '# Performance Test Report\n\n';
        report += `**Generated:** ${results.timestamp}\n\n`;
        report += `**Overall Result:** ${results.summary.overallResult}\n\n`;

        // Summary
        report += '## Summary\n\n';
        report += `- **Total Tests:** ${results.summary.totalTests}\n`;
        report += `- **Passed Tests:** ${results.summary.passedTests}\n`;
        report += `- **Failed Tests:** ${results.summary.failedTests}\n`;
        report += `- **Success Rate:** ${((results.summary.passedTests / results.summary.totalTests) * 100).toFixed(1)}%\n\n`;

        // Test Results
        report += '## Test Results\n\n';
        report += `- **Response Time Validation:** ${results.responseTimeValidation ? '✅ PASSED' : '❌ FAILED'}\n`;
        report += `- **Memory Usage Validation:** ${results.memoryUsageValidation ? '✅ PASSED' : '❌ FAILED'}\n`;
        report += `- **Cache Effectiveness Validation:** ${results.cacheEffectivenessValidation ? '✅ PASSED' : '❌ FAILED'}\n`;
        report += `- **Load Test Validation:** ${results.loadTestValidation ? '✅ PASSED' : '❌ FAILED'}\n\n`;

        // Configuration
        report += '## Test Configuration\n\n';
        report += `- **Response Time Threshold:** ${this.performanceConfig.responseTimeThreshold}ms\n`;
        report += `- **Memory Limit:** ${this.performanceConfig.memoryLimitMB}MB\n`;
        report += `- **Cache Hit Rate Threshold:** ${(this.performanceConfig.cacheHitRateThreshold * 100).toFixed(1)}%\n`;
        report += `- **Load Test Max Response Time:** ${this.performanceConfig.loadTestThresholds.maxResponseTime}ms\n`;
        report += `- **Load Test Max Memory Usage:** ${this.performanceConfig.loadTestThresholds.maxMemoryUsage}MB\n`;
        report += `- **Load Test Min Cache Hit Rate:** ${(this.performanceConfig.loadTestThresholds.minCacheHitRate * 100).toFixed(1)}%\n`;
        report += `- **Load Test Min Throughput:** ${this.performanceConfig.loadTestThresholds.minThroughput} req/s\n`;
        report += `- **Load Test Max Error Rate:** ${(this.performanceConfig.loadTestThresholds.maxErrorRate * 100).toFixed(1)}%\n\n`;

        // Recommendations
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
        logger.info(`Performance report saved to: ${reportPath}`);
    }

    async cleanup(): Promise<void> {
        logger.info('Cleaning up performance test environment');

        try {
            // Cleanup services if they have close methods
            if (this.cacheManager && typeof (this.cacheManager as any).close === 'function') {
                await (this.cacheManager as any).close();
            }
            if (this.vectorDatabase && typeof (this.vectorDatabase as any).close === 'function') {
                await (this.vectorDatabase as any).close();
            }
        } catch (error) {
            logger.warn('Error during cleanup', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
}

// CLI execution
async function main() {
    const runner = new PerformanceTestRunner();

    try {
        await runner.initialize();
        await runner.runAllTests();

        console.log('\n✅ Performance tests completed successfully!');
        console.log('📊 Check the performance-results directory for detailed reports.');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Performance tests failed:', error);
        process.exit(1);
    } finally {
        await runner.cleanup();
    }
}

// Handle process signals
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