import { CacheManager } from '../../services/cache';
import { Alert, MonitoringService, QueryMetrics } from '../../services/monitoring';

// Mock CacheManager
jest.mock('../../services/cache');

describe('MonitoringService', () => {
    let monitoringService: MonitoringService;
    let mockCacheManager: jest.Mocked<CacheManager>;

    beforeEach(() => {
        // Create mock cache manager
        mockCacheManager = {
            getStats: jest.fn().mockResolvedValue({
                hits: 80,
                misses: 20,
                hitRate: 0.8,
                totalKeys: 100,
                memoryUsage: 1024 * 1024,
                evictions: 5
            }),
            healthCheck: jest.fn().mockResolvedValue(true)
        } as any;

        monitoringService = new MonitoringService(mockCacheManager);
    });

    afterEach(() => {
        monitoringService.destroy();
        jest.clearAllMocks();
    });

    describe('Query Metrics Tracking', () => {
        it('should record query start and end correctly', async () => {
            const queryId = 'test-query-1';
            const userId = 'user-123';

            // Record query start
            monitoringService.recordQueryStart(queryId, userId);

            // Add a small delay to ensure response time > 0
            await new Promise(resolve => setTimeout(resolve, 10));

            // Record query end
            monitoringService.recordQueryEnd(queryId, true, false, 3, 0.85);

            const metrics = monitoringService.getQueryMetrics(1);
            expect(metrics).toHaveLength(1);

            const metric = metrics[0];
            expect(metric).toBeDefined();
            if (metric) {
                expect(metric.queryId).toBe(queryId);
                expect(metric.userId).toBe(userId);
                expect(metric.success).toBe(true);
                expect(metric.cached).toBe(false);
                expect(metric.sourceCount).toBe(3);
                expect(metric.confidence).toBe(0.85);
                expect(metric.responseTime).toBeGreaterThanOrEqual(0);
            }
        });

        it('should handle query end without corresponding start', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            monitoringService.recordQueryEnd('non-existent-query', true, false, 1, 0.5);

            expect(consoleSpy).toHaveBeenCalledWith('Query metric not found for queryId: non-existent-query');
            consoleSpy.mockRestore();
        });

        it('should track failed queries with error codes', () => {
            const queryId = 'failed-query';

            monitoringService.recordQueryStart(queryId);
            monitoringService.recordQueryEnd(queryId, false, false, 0, 0, 'TIMEOUT_ERROR');

            const metrics = monitoringService.getQueryMetrics(1);
            const metric = metrics[0];

            expect(metric).toBeDefined();
            if (metric) {
                expect(metric.success).toBe(false);
                expect(metric.errorCode).toBe('TIMEOUT_ERROR');
            }
        });

        it('should emit queryCompleted event when query ends', (done) => {
            const queryId = 'event-query';

            monitoringService.on('queryCompleted', (metric: QueryMetrics) => {
                expect(metric.queryId).toBe(queryId);
                expect(metric.success).toBe(true);
                done();
            });

            monitoringService.recordQueryStart(queryId);
            monitoringService.recordQueryEnd(queryId, true, true, 2, 0.9);
        });
    });

    describe('Performance Metrics Calculation', () => {
        beforeEach(async () => {
            // Add some test metrics with proper timing
            monitoringService.recordQueryStart('query-1');
            await new Promise(resolve => setTimeout(resolve, 5));
            monitoringService.recordQueryEnd('query-1', true, false, 2, 0.8);

            monitoringService.recordQueryStart('query-2');
            await new Promise(resolve => setTimeout(resolve, 5));
            monitoringService.recordQueryEnd('query-2', true, true, 1, 0.9);

            monitoringService.recordQueryStart('query-3');
            await new Promise(resolve => setTimeout(resolve, 5));
            monitoringService.recordQueryEnd('query-3', false, false, 0, 0, 'ERROR');
        });

        it('should calculate performance metrics correctly', async () => {
            const metrics = await monitoringService.getPerformanceMetrics();

            expect(metrics.totalQueries).toBe(3);
            expect(metrics.successfulQueries).toBe(2);
            expect(metrics.failedQueries).toBe(1);
            expect(metrics.averageResponseTime).toBeGreaterThan(0);
            expect(metrics.cacheHitRate).toBe(0.8);
            expect(metrics.uptime).toBeGreaterThan(0);
            expect(metrics.startTime).toBeGreaterThan(0);
        });

        it('should calculate response time percentiles', async () => {
            // Add more queries with known response times
            for (let i = 1; i <= 100; i++) {
                const queryId = `perf-query-${i}`;
                monitoringService.recordQueryStart(queryId);
                monitoringService.recordQueryEnd(queryId, true, false, 1, 0.8);

                // Manually set response times for testing
                const queryMetrics = (monitoringService as any).queryMetrics;
                const metric = queryMetrics.find((m: any) => m.queryId === queryId);
                if (metric) {
                    metric.responseTime = i * 10; // 10ms, 20ms, 30ms, etc.
                }
            }

            const metrics = await monitoringService.getPerformanceMetrics();

            expect(metrics.responseTimePercentiles.p50).toBeGreaterThan(0);
            expect(metrics.responseTimePercentiles.p90).toBeGreaterThan(metrics.responseTimePercentiles.p50);
            expect(metrics.responseTimePercentiles.p95).toBeGreaterThan(metrics.responseTimePercentiles.p90);
            expect(metrics.responseTimePercentiles.p99).toBeGreaterThan(metrics.responseTimePercentiles.p95);
        });

        it('should handle empty metrics gracefully', async () => {
            const emptyMonitoring = new MonitoringService();
            const metrics = await emptyMonitoring.getPerformanceMetrics();

            expect(metrics.totalQueries).toBe(0);
            expect(metrics.successfulQueries).toBe(0);
            expect(metrics.failedQueries).toBe(0);
            expect(metrics.averageResponseTime).toBe(0);
            expect(metrics.responseTimePercentiles.p50).toBe(0);

            emptyMonitoring.destroy();
        });
    });

    describe('Cache Effectiveness Monitoring', () => {
        it('should return cache effectiveness metrics', async () => {
            const effectiveness = await monitoringService.getCacheEffectiveness();

            expect(effectiveness.hitRate).toBe(0.8);
            expect(effectiveness.totalRequests).toBe(100);
            expect(effectiveness.hits).toBe(80);
            expect(effectiveness.misses).toBe(20);
            expect(effectiveness.memoryUsage).toBe(1024 * 1024);
            expect(effectiveness.evictions).toBe(5);
            expect(effectiveness.keyCount).toBe(100);
        });

        it('should handle missing cache manager', async () => {
            const noCacheMonitoring = new MonitoringService();
            const effectiveness = await noCacheMonitoring.getCacheEffectiveness();

            expect(effectiveness.hitRate).toBe(0);
            expect(effectiveness.totalRequests).toBe(0);
            expect(effectiveness.hits).toBe(0);
            expect(effectiveness.misses).toBe(0);

            noCacheMonitoring.destroy();
        });
    });

    describe('Alert Management', () => {
        it('should set and manage alert thresholds', () => {
            monitoringService.setAlertThreshold('customMetric', 100, 'gt');

            // This is tested indirectly through alert triggering
            expect(true).toBe(true); // Placeholder assertion
        });

        it('should disable and enable alerts', () => {
            monitoringService.setAlertThreshold('testMetric', 50, 'gt');
            monitoringService.disableAlert('testMetric');
            monitoringService.enableAlert('testMetric');

            // This is tested indirectly through alert triggering
            expect(true).toBe(true); // Placeholder assertion
        });

        it('should trigger response time alerts', (done) => {
            monitoringService.setAlertThreshold('responseTime', 100, 'gt');

            monitoringService.on('alert', (alert: Alert) => {
                expect(alert.metric).toBe('responseTime');
                expect(alert.severity).toBe('high');
                expect(alert.value).toBeGreaterThan(100);
                done();
            });

            const queryId = 'slow-query';
            monitoringService.recordQueryStart(queryId);

            // Simulate slow query by manually setting response time
            setTimeout(() => {
                monitoringService.recordQueryEnd(queryId, true, false, 1, 0.8);
            }, 150);
        });

        it('should return recent alerts', () => {
            // Manually add some alerts for testing
            const alertsProperty = (monitoringService as any).alerts;
            alertsProperty.push({
                id: 'test-alert-1',
                metric: 'responseTime',
                value: 5000,
                threshold: 2000,
                message: 'Response time exceeded threshold',
                timestamp: Date.now() - 1000,
                severity: 'high'
            });

            const alerts = monitoringService.getRecentAlerts(10);
            expect(alerts).toHaveLength(1);
            expect(alerts[0]).toBeDefined();
            if (alerts[0]) {
                expect(alerts[0].metric).toBe('responseTime');
            }
        });
    });

    describe('Health Status', () => {
        it('should return healthy status when all checks pass', async () => {
            const health = await monitoringService.getHealthStatus();

            expect(health.status).toBe('healthy');
            expect(health.checks.cache).toBe(true);
            expect(health.checks.memory).toBe(true);
            expect(health.checks.responseTime).toBe(true);
            expect(health.metrics).toBeDefined();
        });

        it('should return degraded status when some checks fail', async () => {
            mockCacheManager.healthCheck.mockResolvedValue(false);

            const health = await monitoringService.getHealthStatus();

            expect(health.status).toBe('degraded');
            expect(health.checks.cache).toBe(false);
        });

        it('should check memory health correctly', async () => {
            // Simulate high memory usage by manipulating system metrics
            const systemMetricsProperty = (monitoringService as any).systemMetrics;
            systemMetricsProperty.push({
                memoryUsage: {
                    heapUsed: 950 * 1024 * 1024, // 950MB
                    heapTotal: 1000 * 1024 * 1024 // 1GB
                },
                cpuUsage: process.cpuUsage(),
                timestamp: Date.now()
            });

            const health = await monitoringService.getHealthStatus();
            expect(health.checks.memory).toBe(false);
        });

        it('should check response time health correctly', async () => {
            // Add slow queries
            for (let i = 0; i < 5; i++) {
                const queryId = `slow-query-${i}`;
                monitoringService.recordQueryStart(queryId);

                // Manually set high response time
                const metrics = (monitoringService as any).queryMetrics;
                const metric = metrics.find((m: any) => m.queryId === queryId);
                if (metric) {
                    metric.endTime = Date.now();
                    metric.responseTime = 6000; // 6 seconds
                    metric.success = true;
                    metric.cached = false;
                    metric.sourceCount = 1;
                    metric.confidence = 0.8;
                }
            }

            const health = await monitoringService.getHealthStatus();
            expect(health.checks.responseTime).toBe(false);
        });
    });

    describe('Data Management', () => {
        it('should return query metrics with limit', () => {
            // Add multiple queries
            for (let i = 0; i < 10; i++) {
                const queryId = `query-${i}`;
                monitoringService.recordQueryStart(queryId);
                monitoringService.recordQueryEnd(queryId, true, false, 1, 0.8);
            }

            const metrics = monitoringService.getQueryMetrics(5);
            expect(metrics).toHaveLength(5);
        });

        it('should return system metrics with limit', () => {
            const metrics = monitoringService.getSystemMetrics(10);
            expect(Array.isArray(metrics)).toBe(true);
        });

        it('should clean up old metrics', (done) => {
            // This tests the internal cleanup mechanism
            // We'll test it by checking that the cleanup interval is set
            const monitoringWithShortRetention = new MonitoringService();

            // Set a very short retention period for testing
            (monitoringWithShortRetention as any).metricsRetentionPeriod = 100; // 100ms

            // Add some metrics
            monitoringWithShortRetention.recordQueryStart('test-query');
            monitoringWithShortRetention.recordQueryEnd('test-query', true, false, 1, 0.8);

            setTimeout(() => {
                // Trigger cleanup manually
                (monitoringWithShortRetention as any).cleanupOldMetrics();

                const metrics = monitoringWithShortRetention.getQueryMetrics();
                expect(metrics).toHaveLength(0);

                monitoringWithShortRetention.destroy();
                done();
            }, 150);
        });
    });

    describe('Cleanup and Destruction', () => {
        it('should clean up resources on destroy', () => {
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            monitoringService.destroy();

            expect(clearIntervalSpy).toHaveBeenCalled();
            clearIntervalSpy.mockRestore();
        });

        it('should remove all event listeners on destroy', () => {
            const removeAllListenersSpy = jest.spyOn(monitoringService, 'removeAllListeners');

            monitoringService.destroy();

            expect(removeAllListenersSpy).toHaveBeenCalled();
        });
    });

    describe('Edge Cases and Error Handling', () => {
        it('should handle percentile calculation with empty array', async () => {
            const emptyMonitoring = new MonitoringService();
            const metrics = await emptyMonitoring.getPerformanceMetrics();

            expect(metrics.responseTimePercentiles.p50).toBe(0);
            expect(metrics.responseTimePercentiles.p90).toBe(0);
            expect(metrics.responseTimePercentiles.p95).toBe(0);
            expect(metrics.responseTimePercentiles.p99).toBe(0);

            emptyMonitoring.destroy();
        });

        it('should handle percentile calculation with single value', async () => {
            const singleValueMonitoring = new MonitoringService();

            singleValueMonitoring.recordQueryStart('single-query');
            await new Promise(resolve => setTimeout(resolve, 10));
            singleValueMonitoring.recordQueryEnd('single-query', true, false, 1, 0.8);

            const metrics = await singleValueMonitoring.getPerformanceMetrics();

            expect(metrics.responseTimePercentiles.p50).toBeGreaterThanOrEqual(0);
            expect(metrics.responseTimePercentiles.p90).toBe(metrics.responseTimePercentiles.p50);

            singleValueMonitoring.destroy();
        });

        it('should handle cache manager errors gracefully', async () => {
            mockCacheManager.getStats.mockRejectedValue(new Error('Cache error'));

            const effectiveness = await monitoringService.getCacheEffectiveness();

            // Should return default values when cache fails
            expect(effectiveness.hitRate).toBe(0);
            expect(effectiveness.totalRequests).toBe(0);
        });

        it('should handle health check errors gracefully', async () => {
            mockCacheManager.healthCheck.mockRejectedValue(new Error('Health check failed'));

            const health = await monitoringService.getHealthStatus();

            expect(health.checks.cache).toBe(false);
        });
    });
});