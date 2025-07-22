import { EventEmitter } from 'events';
import { CacheManager } from './cache';
import { DataSourceManager } from './dataSourceManager';
import { EmbeddingService } from './embedding';
import { MonitoringService } from './monitoring';
import { VectorSearchEngine } from './vectorSearch';
export interface ComponentHealth {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime?: number;
    lastCheck: Date;
    details?: {
        [key: string]: any;
    };
    error?: string;
    metrics?: {
        [key: string]: number;
    };
}
export interface SystemHealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    components: ComponentHealth[];
    uptime: number;
    version: string;
    environment: string;
}
export interface HealthCheckConfig {
    checkInterval: number;
    timeoutMs: number;
    retryAttempts: number;
    alertThresholds: {
        responseTime: number;
        errorRate: number;
        consecutiveFailures: number;
        memoryUsage: number;
        cpuUsage: number;
        diskUsage?: number;
        cacheHitRate: number;
        dataSourceFailurePercentage: number;
    };
}
export interface DataSourceHealthSummary {
    totalSources: number;
    healthySources: number;
    unhealthySources: number;
    degradedSources: number;
    lastChecked: Date;
    overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    sources: Array<{
        id: string;
        name: string;
        type: string;
        status: 'healthy' | 'degraded' | 'unhealthy';
        responseTime?: number;
        lastError?: string;
        lastSuccessfulConnection?: Date;
        connectionAttempts?: number;
        consecutiveFailures?: number;
    }>;
}
export declare class HealthCheckService extends EventEmitter {
    private config;
    private cacheManager?;
    private dataSourceManager?;
    private monitoringService?;
    private embeddingService?;
    private vectorSearchEngine?;
    private healthCheckInterval?;
    private componentFailureCounts;
    private lastHealthCheck;
    private startTime;
    constructor(config: HealthCheckConfig, dependencies?: {
        cacheManager?: CacheManager;
        dataSourceManager?: DataSourceManager;
        monitoringService?: MonitoringService;
        embeddingService?: EmbeddingService;
        vectorSearchEngine?: VectorSearchEngine;
    });
    start(): void;
    stop(): void;
    getSystemHealth(): Promise<SystemHealthStatus>;
    checkComponent(componentName: string): Promise<ComponentHealth>;
    getDataSourceHealth(): Promise<DataSourceHealthSummary>;
    private sourceConnectionMetrics;
    private getSourceConnectionMetrics;
    private updateSourceConnectionMetrics;
    private performHealthCheck;
    checkComponentWithAlerts(componentName: string): Promise<ComponentHealth>;
    private checkAllComponents;
    private checkApiHealth;
    private checkCacheHealth;
    private checkDataSourcesHealth;
    private checkEmbeddingServiceHealth;
    private checkVectorSearchHealth;
    private checkMonitoringHealth;
    private determineOverallStatus;
    private handleComponentHealth;
    private checkPerformanceDegradation;
    private historicalMetrics;
    private storeHistoricalMetrics;
    private analyzePerformanceTrends;
    private triggerAlert;
    private formatAlertMessage;
    private determineSeverity;
    getLastHealthCheck(): Date;
    getComponentFailureCounts(): Map<string, number>;
    resetComponentFailureCount(componentName: string): void;
    getPerformanceTrends(): Promise<{
        responseTime: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isDegrading: boolean;
        };
        errorRate: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isIncreasing: boolean;
        };
        memoryUsage: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isIncreasing: boolean;
        };
        cacheHitRate: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isDecreasing: boolean;
        };
        dataPoints: number;
        timeRange: {
            start: Date;
            end: Date;
        };
    }>;
    private calculateMetricTrend;
    destroy(): void;
}
//# sourceMappingURL=healthCheck.d.ts.map