import { SystemConfig } from '../../models/config';
import { CacheManager } from '../../services/cache';
import { DataSourceManager } from '../../services/dataSourceManager';
import { QueryProcessor } from '../../services/queryProcessor';
export interface BenchmarkResult {
    testName: string;
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p50ResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;
    errorRate: number;
    memoryUsage: NodeJS.MemoryUsage;
    cacheHitRate: number;
    testDuration: number;
}
export interface BenchmarkConfig {
    name: string;
    queries: string[];
    iterations: number;
    concurrency: number;
    warmupIterations?: number;
    cooldownTime?: number;
}
export declare class BenchmarkRunner {
    private queryProcessor;
    private cacheManager;
    constructor(queryProcessor: QueryProcessor, cacheManager: CacheManager, _dataSourceManager: DataSourceManager, _config: SystemConfig);
    runBenchmarkSuite(): Promise<BenchmarkResult[]>;
    runBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult>;
    generatePerformanceReport(results: BenchmarkResult[]): string;
    private runWarmup;
    private executeQuery;
    private calculatePercentile;
}
//# sourceMappingURL=benchmarkRunner.d.ts.map