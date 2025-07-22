import { EventEmitter } from 'events';
import { CacheManager, CacheStats } from './cache';
export interface QueryMetrics {
    queryId: string;
    startTime: number;
    endTime: number;
    responseTime: number;
    success: boolean;
    cached: boolean;
    sourceCount: number;
    confidence: number;
    userId?: string;
    errorCode?: string;
}
export interface PerformanceMetrics {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageResponseTime: number;
    responseTimePercentiles: {
        p50: number;
        p90: number;
        p95: number;
        p99: number;
    };
    cacheHitRate: number;
    cacheStats: CacheStats;
    uptime: number;
    startTime: number;
}
export interface SystemMetrics {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    timestamp: number;
}
export interface AlertThreshold {
    metric: string;
    threshold: number;
    operator: 'gt' | 'lt' | 'gte' | 'lte';
    enabled: boolean;
}
export interface Alert {
    id: string;
    metric: string;
    value: number;
    threshold: number;
    message: string;
    timestamp: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
}
export declare class MonitoringService extends EventEmitter {
    private queryMetrics;
    private systemMetrics;
    private alerts;
    private alertThresholds;
    private startTime;
    private cacheManager?;
    private metricsRetentionPeriod;
    private systemMetricsInterval?;
    private cleanupInterval?;
    constructor(cacheManager?: CacheManager);
    private setupDefaultThresholds;
    private startSystemMetricsCollection;
    private startCleanupTask;
    private collectSystemMetrics;
    private cleanupOldMetrics;
    recordQueryStart(queryId: string, userId?: string): void;
    recordQueryEnd(queryId: string, success: boolean, cached: boolean, sourceCount: number, confidence: number, errorCode?: string): void;
    getPerformanceMetrics(): Promise<PerformanceMetrics>;
    private calculatePercentiles;
    getCacheEffectiveness(): Promise<{
        hitRate: number;
        totalRequests: number;
        hits: number;
        misses: number;
        memoryUsage: number;
        evictions: number;
        keyCount: number;
    }>;
    setAlertThreshold(metric: string, threshold: number, operator: 'gt' | 'lt' | 'gte' | 'lte'): void;
    disableAlert(metric: string): void;
    enableAlert(metric: string): void;
    private checkQueryAlerts;
    private checkSystemAlerts;
    private checkThreshold;
    private createAlert;
    getRecentAlerts(limit?: number): Alert[];
    getQueryMetrics(limit?: number): QueryMetrics[];
    getSystemMetrics(limit?: number): SystemMetrics[];
    getHealthStatus(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        checks: {
            [key: string]: boolean;
        };
        metrics: PerformanceMetrics;
    }>;
    private checkMemoryHealth;
    private checkResponseTimeHealth;
    destroy(): void;
}
//# sourceMappingURL=monitoring.d.ts.map