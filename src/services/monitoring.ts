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

export class MonitoringService extends EventEmitter {
    private queryMetrics: QueryMetrics[] = [];
    private systemMetrics: SystemMetrics[] = [];
    private alerts: Alert[] = [];
    private alertThresholds: AlertThreshold[] = [];
    private startTime: number;
    private cacheManager?: CacheManager;
    private metricsRetentionPeriod: number = 24 * 60 * 60 * 1000; // 24 hours
    private systemMetricsInterval?: NodeJS.Timeout;
    private cleanupInterval?: NodeJS.Timeout;

    constructor(cacheManager?: CacheManager) {
        super();
        this.startTime = Date.now();
        this.cacheManager = cacheManager;
        this.setupDefaultThresholds();
        this.startSystemMetricsCollection();
        this.startCleanupTask();
    }

    private setupDefaultThresholds(): void {
        this.alertThresholds = [
            { metric: 'responseTime', threshold: 5000, operator: 'gt', enabled: true }, // 5 seconds
            { metric: 'errorRate', threshold: 0.1, operator: 'gt', enabled: true }, // 10%
            { metric: 'cacheHitRate', threshold: 0.5, operator: 'lt', enabled: true }, // 50%
            { metric: 'memoryUsage', threshold: 0.9, operator: 'gt', enabled: true }, // 90%
        ];
    }

    private startSystemMetricsCollection(): void {
        this.systemMetricsInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 30000); // Collect every 30 seconds
    }

    private startCleanupTask(): void {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
        }, 60 * 60 * 1000); // Cleanup every hour
    }

    private collectSystemMetrics(): void {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        const metrics: SystemMetrics = {
            memoryUsage,
            cpuUsage,
            timestamp: Date.now()
        };

        this.systemMetrics.push(metrics);
        this.checkSystemAlerts(metrics);
    }

    private cleanupOldMetrics(): void {
        const cutoffTime = Date.now() - this.metricsRetentionPeriod;

        // Clean up old query metrics
        this.queryMetrics = this.queryMetrics.filter(metric => metric.endTime > cutoffTime);

        // Clean up old system metrics
        this.systemMetrics = this.systemMetrics.filter(metric => metric.timestamp > cutoffTime);

        // Clean up old alerts (keep for 7 days)
        const alertCutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.alerts = this.alerts.filter(alert => alert.timestamp > alertCutoffTime);
    }

    // Query metrics tracking
    public recordQueryStart(queryId: string, userId?: string): void {
        const startTime = Date.now();

        // Remove any existing incomplete metric for this query
        this.queryMetrics = this.queryMetrics.filter(m => m.queryId !== queryId);

        const metric: Partial<QueryMetrics> = {
            queryId,
            startTime,
            userId
        };

        this.queryMetrics.push(metric as QueryMetrics);
    }

    public recordQueryEnd(
        queryId: string,
        success: boolean,
        cached: boolean,
        sourceCount: number,
        confidence: number,
        errorCode?: string
    ): void {
        const endTime = Date.now();
        const metricIndex = this.queryMetrics.findIndex(m => m.queryId === queryId);

        if (metricIndex === -1) {
            console.warn(`Query metric not found for queryId: ${queryId}`);
            return;
        }

        const metric = this.queryMetrics[metricIndex];
        if (metric) {
            metric.endTime = endTime;
            metric.responseTime = endTime - metric.startTime;
            metric.success = success;
            metric.cached = cached;
            metric.sourceCount = sourceCount;
            metric.confidence = confidence;
            metric.errorCode = errorCode;

            this.checkQueryAlerts(metric);
            this.emit('queryCompleted', metric);
        }
    }

    // Performance metrics calculation
    public async getPerformanceMetrics(): Promise<PerformanceMetrics> {
        const now = Date.now();
        const recentMetrics = this.queryMetrics.filter(m => m.endTime && m.endTime > 0);

        const totalQueries = recentMetrics.length;
        const successfulQueries = recentMetrics.filter(m => m.success).length;
        const failedQueries = totalQueries - successfulQueries;

        // Calculate response time statistics
        const responseTimes = recentMetrics
            .filter(m => m.responseTime > 0)
            .map(m => m.responseTime)
            .sort((a, b) => a - b);

        const averageResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
            : 0;

        const responseTimePercentiles = this.calculatePercentiles(responseTimes);

        // Get cache statistics
        const cacheStats = this.cacheManager ? await this.cacheManager.getStats() : {
            hits: 0,
            misses: 0,
            hitRate: 0,
            totalKeys: 0,
            memoryUsage: 0,
            evictions: 0
        };

        return {
            totalQueries,
            successfulQueries,
            failedQueries,
            averageResponseTime,
            responseTimePercentiles,
            cacheHitRate: cacheStats.hitRate,
            cacheStats,
            uptime: now - this.startTime,
            startTime: this.startTime
        };
    }

    private calculatePercentiles(sortedValues: number[]): {
        p50: number;
        p90: number;
        p95: number;
        p99: number;
    } {
        if (sortedValues.length === 0) {
            return { p50: 0, p90: 0, p95: 0, p99: 0 };
        }

        const getPercentile = (values: number[], percentile: number): number => {
            const index = Math.ceil((percentile / 100) * values.length) - 1;
            return values[Math.max(0, Math.min(index, values.length - 1))] || 0;
        };

        return {
            p50: getPercentile(sortedValues, 50),
            p90: getPercentile(sortedValues, 90),
            p95: getPercentile(sortedValues, 95),
            p99: getPercentile(sortedValues, 99)
        };
    }

    // Cache monitoring
    public async getCacheEffectiveness(): Promise<{
        hitRate: number;
        totalRequests: number;
        hits: number;
        misses: number;
        memoryUsage: number;
        evictions: number;
        keyCount: number;
    }> {
        if (!this.cacheManager) {
            return {
                hitRate: 0,
                totalRequests: 0,
                hits: 0,
                misses: 0,
                memoryUsage: 0,
                evictions: 0,
                keyCount: 0
            };
        }

        try {
            const stats = await this.cacheManager.getStats();
            return {
                hitRate: stats.hitRate,
                totalRequests: stats.hits + stats.misses,
                hits: stats.hits,
                misses: stats.misses,
                memoryUsage: stats.memoryUsage,
                evictions: stats.evictions,
                keyCount: stats.totalKeys
            };
        } catch (error) {
            return {
                hitRate: 0,
                totalRequests: 0,
                hits: 0,
                misses: 0,
                memoryUsage: 0,
                evictions: 0,
                keyCount: 0
            };
        }
    }

    // Alert management
    public setAlertThreshold(metric: string, threshold: number, operator: 'gt' | 'lt' | 'gte' | 'lte'): void {
        const existingIndex = this.alertThresholds.findIndex(t => t.metric === metric);

        if (existingIndex >= 0) {
            this.alertThresholds[existingIndex] = { metric, threshold, operator, enabled: true };
        } else {
            this.alertThresholds.push({ metric, threshold, operator, enabled: true });
        }
    }

    public disableAlert(metric: string): void {
        const threshold = this.alertThresholds.find(t => t.metric === metric);
        if (threshold) {
            threshold.enabled = false;
        }
    }

    public enableAlert(metric: string): void {
        const threshold = this.alertThresholds.find(t => t.metric === metric);
        if (threshold) {
            threshold.enabled = true;
        }
    }

    private checkQueryAlerts(metric: QueryMetrics): void {
        // Check response time alert
        const responseTimeThreshold = this.alertThresholds.find(t => t.metric === 'responseTime' && t.enabled);
        if (responseTimeThreshold && this.checkThreshold(metric.responseTime, responseTimeThreshold)) {
            this.createAlert(
                'responseTime',
                metric.responseTime,
                responseTimeThreshold.threshold,
                `Query ${metric.queryId} took ${metric.responseTime}ms to complete`,
                'high'
            );
        }
    }

    private checkSystemAlerts(metrics: SystemMetrics): void {
        // Check memory usage alert
        const memoryThreshold = this.alertThresholds.find(t => t.metric === 'memoryUsage' && t.enabled);
        if (memoryThreshold) {
            const memoryUsageRatio = metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal;
            if (this.checkThreshold(memoryUsageRatio, memoryThreshold)) {
                this.createAlert(
                    'memoryUsage',
                    memoryUsageRatio,
                    memoryThreshold.threshold,
                    `Memory usage is at ${(memoryUsageRatio * 100).toFixed(1)}%`,
                    'medium'
                );
            }
        }
    }

    private checkThreshold(value: number, threshold: AlertThreshold): boolean {
        switch (threshold.operator) {
            case 'gt': return value > threshold.threshold;
            case 'lt': return value < threshold.threshold;
            case 'gte': return value >= threshold.threshold;
            case 'lte': return value <= threshold.threshold;
            default: return false;
        }
    }

    private createAlert(
        metric: string,
        value: number,
        threshold: number,
        message: string,
        severity: 'low' | 'medium' | 'high' | 'critical'
    ): void {
        const alert: Alert = {
            id: `${metric}-${Date.now()}`,
            metric,
            value,
            threshold,
            message,
            timestamp: Date.now(),
            severity
        };

        this.alerts.push(alert);
        this.emit('alert', alert);
    }

    // Reporting methods
    public getRecentAlerts(limit: number = 50): Alert[] {
        return this.alerts
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    public getQueryMetrics(limit: number = 100): QueryMetrics[] {
        return this.queryMetrics
            .filter(m => m.endTime && m.endTime > 0)
            .sort((a, b) => b.endTime - a.endTime)
            .slice(0, limit);
    }

    public getSystemMetrics(limit: number = 100): SystemMetrics[] {
        return this.systemMetrics
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    // Health check
    public async getHealthStatus(): Promise<{
        status: 'healthy' | 'degraded' | 'unhealthy';
        checks: { [key: string]: boolean };
        metrics: PerformanceMetrics;
    }> {
        const checks = {
            cache: this.cacheManager ? await this.cacheManager.healthCheck().catch(() => false) : true,
            memory: this.checkMemoryHealth(),
            responseTime: this.checkResponseTimeHealth()
        };

        const allHealthy = Object.values(checks).every(check => check);
        const someHealthy = Object.values(checks).some(check => check);

        const status = allHealthy ? 'healthy' : someHealthy ? 'degraded' : 'unhealthy';
        const metrics = await this.getPerformanceMetrics();

        return { status, checks, metrics };
    }

    private checkMemoryHealth(): boolean {
        if (this.systemMetrics.length === 0) return true;

        const latestMetrics = this.systemMetrics[this.systemMetrics.length - 1];
        if (!latestMetrics) return true;

        const memoryUsageRatio = latestMetrics.memoryUsage.heapUsed / latestMetrics.memoryUsage.heapTotal;

        return memoryUsageRatio < 0.9; // Consider unhealthy if memory usage > 90%
    }

    private checkResponseTimeHealth(): boolean {
        const recentMetrics = this.queryMetrics
            .filter(m => m.endTime && m.endTime > Date.now() - 5 * 60 * 1000) // Last 5 minutes
            .filter(m => m.success);

        if (recentMetrics.length === 0) return true;

        const averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
        return averageResponseTime < 5000; // Consider unhealthy if average response time > 5 seconds
    }

    // Cleanup
    public destroy(): void {
        if (this.systemMetricsInterval) {
            clearInterval(this.systemMetricsInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.removeAllListeners();
    }
}
