"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MonitoringService = void 0;
const events_1 = require("events");
class MonitoringService extends events_1.EventEmitter {
    constructor(cacheManager) {
        super();
        this.queryMetrics = [];
        this.systemMetrics = [];
        this.alerts = [];
        this.alertThresholds = [];
        this.metricsRetentionPeriod = 24 * 60 * 60 * 1000;
        this.startTime = Date.now();
        this.cacheManager = cacheManager;
        this.setupDefaultThresholds();
        this.startSystemMetricsCollection();
        this.startCleanupTask();
    }
    setupDefaultThresholds() {
        this.alertThresholds = [
            { metric: 'responseTime', threshold: 5000, operator: 'gt', enabled: true },
            { metric: 'errorRate', threshold: 0.1, operator: 'gt', enabled: true },
            { metric: 'cacheHitRate', threshold: 0.5, operator: 'lt', enabled: true },
            { metric: 'memoryUsage', threshold: 0.9, operator: 'gt', enabled: true },
        ];
    }
    startSystemMetricsCollection() {
        this.systemMetricsInterval = setInterval(() => {
            this.collectSystemMetrics();
        }, 30000);
    }
    startCleanupTask() {
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldMetrics();
        }, 60 * 60 * 1000);
    }
    collectSystemMetrics() {
        const memoryUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();
        const metrics = {
            memoryUsage,
            cpuUsage,
            timestamp: Date.now()
        };
        this.systemMetrics.push(metrics);
        this.checkSystemAlerts(metrics);
    }
    cleanupOldMetrics() {
        const cutoffTime = Date.now() - this.metricsRetentionPeriod;
        this.queryMetrics = this.queryMetrics.filter(metric => metric.endTime > cutoffTime);
        this.systemMetrics = this.systemMetrics.filter(metric => metric.timestamp > cutoffTime);
        const alertCutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
        this.alerts = this.alerts.filter(alert => alert.timestamp > alertCutoffTime);
    }
    recordQueryStart(queryId, userId) {
        const startTime = Date.now();
        this.queryMetrics = this.queryMetrics.filter(m => m.queryId !== queryId);
        const metric = {
            queryId,
            startTime,
            userId
        };
        this.queryMetrics.push(metric);
    }
    recordQueryEnd(queryId, success, cached, sourceCount, confidence, errorCode) {
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
    async getPerformanceMetrics() {
        const now = Date.now();
        const recentMetrics = this.queryMetrics.filter(m => m.endTime && m.endTime > 0);
        const totalQueries = recentMetrics.length;
        const successfulQueries = recentMetrics.filter(m => m.success).length;
        const failedQueries = totalQueries - successfulQueries;
        const responseTimes = recentMetrics
            .filter(m => m.responseTime > 0)
            .map(m => m.responseTime)
            .sort((a, b) => a - b);
        const averageResponseTime = responseTimes.length > 0
            ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
            : 0;
        const responseTimePercentiles = this.calculatePercentiles(responseTimes);
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
    calculatePercentiles(sortedValues) {
        if (sortedValues.length === 0) {
            return { p50: 0, p90: 0, p95: 0, p99: 0 };
        }
        const getPercentile = (values, percentile) => {
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
    async getCacheEffectiveness() {
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
        }
        catch (error) {
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
    setAlertThreshold(metric, threshold, operator) {
        const existingIndex = this.alertThresholds.findIndex(t => t.metric === metric);
        if (existingIndex >= 0) {
            this.alertThresholds[existingIndex] = { metric, threshold, operator, enabled: true };
        }
        else {
            this.alertThresholds.push({ metric, threshold, operator, enabled: true });
        }
    }
    disableAlert(metric) {
        const threshold = this.alertThresholds.find(t => t.metric === metric);
        if (threshold) {
            threshold.enabled = false;
        }
    }
    enableAlert(metric) {
        const threshold = this.alertThresholds.find(t => t.metric === metric);
        if (threshold) {
            threshold.enabled = true;
        }
    }
    checkQueryAlerts(metric) {
        const responseTimeThreshold = this.alertThresholds.find(t => t.metric === 'responseTime' && t.enabled);
        if (responseTimeThreshold && this.checkThreshold(metric.responseTime, responseTimeThreshold)) {
            this.createAlert('responseTime', metric.responseTime, responseTimeThreshold.threshold, `Query ${metric.queryId} took ${metric.responseTime}ms to complete`, 'high');
        }
    }
    checkSystemAlerts(metrics) {
        const memoryThreshold = this.alertThresholds.find(t => t.metric === 'memoryUsage' && t.enabled);
        if (memoryThreshold) {
            const memoryUsageRatio = metrics.memoryUsage.heapUsed / metrics.memoryUsage.heapTotal;
            if (this.checkThreshold(memoryUsageRatio, memoryThreshold)) {
                this.createAlert('memoryUsage', memoryUsageRatio, memoryThreshold.threshold, `Memory usage is at ${(memoryUsageRatio * 100).toFixed(1)}%`, 'medium');
            }
        }
    }
    checkThreshold(value, threshold) {
        switch (threshold.operator) {
            case 'gt': return value > threshold.threshold;
            case 'lt': return value < threshold.threshold;
            case 'gte': return value >= threshold.threshold;
            case 'lte': return value <= threshold.threshold;
            default: return false;
        }
    }
    createAlert(metric, value, threshold, message, severity) {
        const alert = {
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
    getRecentAlerts(limit = 50) {
        return this.alerts
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
    getQueryMetrics(limit = 100) {
        return this.queryMetrics
            .filter(m => m.endTime && m.endTime > 0)
            .sort((a, b) => b.endTime - a.endTime)
            .slice(0, limit);
    }
    getSystemMetrics(limit = 100) {
        return this.systemMetrics
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }
    async getHealthStatus() {
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
    checkMemoryHealth() {
        if (this.systemMetrics.length === 0)
            return true;
        const latestMetrics = this.systemMetrics[this.systemMetrics.length - 1];
        if (!latestMetrics)
            return true;
        const memoryUsageRatio = latestMetrics.memoryUsage.heapUsed / latestMetrics.memoryUsage.heapTotal;
        return memoryUsageRatio < 0.9;
    }
    checkResponseTimeHealth() {
        const recentMetrics = this.queryMetrics
            .filter(m => m.endTime && m.endTime > Date.now() - 5 * 60 * 1000)
            .filter(m => m.success);
        if (recentMetrics.length === 0)
            return true;
        const averageResponseTime = recentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / recentMetrics.length;
        return averageResponseTime < 5000;
    }
    destroy() {
        if (this.systemMetricsInterval) {
            clearInterval(this.systemMetricsInterval);
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.removeAllListeners();
    }
}
exports.MonitoringService = MonitoringService;
//# sourceMappingURL=monitoring.js.map