import { SystemConfig } from '../../models/config';
import { CacheManager } from '../../services/cache';
import { DataSourceManager } from '../../services/dataSourceManager';
import { QueryProcessor } from '../../services/queryProcessor';
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
export declare class PerformanceValidator {
    private queryProcessor;
    private cacheManager;
    constructor(queryProcessor: QueryProcessor, cacheManager: CacheManager, _dataSourceManager: DataSourceManager, _config: SystemConfig);
    validateResponseTime(queries: string[], threshold?: number): Promise<boolean>;
    validateMemoryUsage(maxMemoryMB?: number): Promise<boolean>;
    validateCacheEffectiveness(minHitRate?: number): Promise<boolean>;
    runLoadTest(config: LoadTestConfig): Promise<PerformanceMetrics>;
    validateSystemUnderLoad(thresholds: PerformanceThresholds): Promise<boolean>;
    private simulateUser;
    private calculatePercentile;
}
//# sourceMappingURL=performanceValidator.d.ts.map