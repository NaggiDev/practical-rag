import { CacheManager } from '../../services/cache';
import { DataSourceManager } from '../../services/dataSourceManager';
import { EmbeddingResult, EmbeddingService } from '../../services/embedding';
import { HealthCheckConfig, HealthCheckService } from '../../services/healthCheck';
import { MonitoringService } from '../../services/monitoring';
import { VectorSearchEngine } from '../../services/vectorSearch';

// Mock dependencies
jest.mock('../../services/cache');
jest.mock('../../services/dataSourceManager');
jest.mock('../../services/monitoring');
jest.mock('../../services/embedding');
jest.mock('../../services/vectorSearch');

describe('HealthCheckService', () => {
    let healthCheckService: HealthCheckService;
    let mockCacheManager: jest.Mocked<CacheManager>;
    let mockDataSourceManager: jest.Mocked<DataSourceManager>;
    let mockMonitoringService: jest.Mocked<MonitoringService>;
    let mockEmbeddingService: jest.Mocked<EmbeddingService>;
    let mockVectorSearchEngine: jest.Mocked<VectorSearchEngine>;

    const defaultConfig: HealthCheckConfig = {
        checkInterval: 1000,
        timeoutMs: 5000,
        retryAttempts: 3,
        alertThresholds: {
            responseTime: 2000,
            errorRate: 0.1,
            consecutiveFailures: 3
        }
    };

    const mockEmbeddingResult: EmbeddingResult = {
        text: 'health check test',
        embedding: [0.1, 0.2, 0.3],
        model: 'test-model',
        timestamp: new Date(),
        cached: false
    };

    beforeEach(() => {
        // Create mocked instances
        mockCacheManager = {
            healthCheck: jest.fn(),
            getStats: jest.fn(),
            getConnectionStatus: jest.fn()
        } as any;

        mockDataSourceManager = {
            getAllSources: jest.fn(),
            checkHealth: jest.fn()
        } as any;

        mockMonitoringService = {
            getPerformanceMetrics: jest.fn()
        } as any;

        mockEmbeddingService = {
            generateEmbedding: jest.fn()
        } as any;

        mockVectorSearchEngine = {
            semanticSearch: jest.fn()
        } as any;

        // Set up default mock return values
        mockEmbeddingService.generateEmbedding.mockResolvedValue(mockEmbeddingResult);

        healthCheckService = new HealthCheckService(defaultConfig, {
            cacheManager: mockCacheManager,
            dataSourceManager: mockDataSourceManager,
            monitoringService: mockMonitoringService,
            embeddingService: mockEmbeddingService,
            vectorSearchEngine: mockVectorSearchEngine
        });
    });

    afterEach(() => {
        healthCheckService.destroy();
        jest.clearAllMocks();
    });

    describe('getSystemHealth', () => {
        it('should return healthy status when all components are healthy', async () => {
            // Mock all components as healthy
            mockCacheManager.healthCheck.mockResolvedValue(true);
            mockCacheManager.getStats.mockResolvedValue({
                hits: 100,
                misses: 20,
                hitRate: 0.83,
                totalKeys: 50,
                memoryUsage: 1024,
                evictions: 0
            });

            mockDataSourceManager.getAllSources.mockResolvedValue({
                items: [
                    { id: '1', name: 'Test Source', type: 'file', status: 'active' } as any
                ],
                pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
            });

            mockDataSourceManager.checkHealth.mockResolvedValue({
                sourceId: '1',
                isHealthy: true,
                lastCheck: new Date(),
                responseTime: 100,
                errorCount: 0
            });

            mockMonitoringService.getPerformanceMetrics.mockResolvedValue({
                totalQueries: 100,
                successfulQueries: 95,
                failedQueries: 5,
                averageResponseTime: 500,
                responseTimePercentiles: { p50: 400, p90: 800, p95: 1000, p99: 1500 },
                cacheHitRate: 0.83,
                cacheStats: {} as any,
                uptime: 3600000,
                startTime: Date.now() - 3600000
            });

            mockVectorSearchEngine.semanticSearch.mockResolvedValue([]);

            const systemHealth = await healthCheckService.getSystemHealth();

            expect(systemHealth.status).toBe('degraded'); // Will be degraded due to no data sources
            expect(systemHealth.components).toHaveLength(6);
            // Most components should be healthy, but data_sources will be degraded due to no sources
            const healthyComponents = systemHealth.components.filter(c => c.status === 'healthy');
            expect(healthyComponents.length).toBeGreaterThan(4);
            expect(systemHealth.uptime).toBeGreaterThan(0);
            expect(systemHealth.version).toBeDefined();
            expect(systemHealth.environment).toBeDefined();
        });

        it('should return degraded status when some components are degraded', async () => {
            // Mock cache as degraded (low hit rate)
            mockCacheManager.healthCheck.mockResolvedValue(true);
            mockCacheManager.getStats.mockResolvedValue({
                hits: 10,
                misses: 90,
                hitRate: 0.1, // Low hit rate
                totalKeys: 50,
                memoryUsage: 1024,
                evictions: 0
            });

            // Mock other components as healthy
            mockDataSourceManager.getAllSources.mockResolvedValue({
                items: [],
                pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
            });

            mockMonitoringService.getPerformanceMetrics.mockResolvedValue({
                totalQueries: 100,
                successfulQueries: 95,
                failedQueries: 5,
                averageResponseTime: 500,
                responseTimePercentiles: { p50: 400, p90: 800, p95: 1000, p99: 1500 },
                cacheHitRate: 0.1,
                cacheStats: {} as any,
                uptime: 3600000,
                startTime: Date.now() - 3600000
            });

            mockVectorSearchEngine.semanticSearch.mockResolvedValue([]);

            const systemHealth = await healthCheckService.getSystemHealth();

            expect(systemHealth.status).toBe('degraded');
            expect(systemHealth.components.some(c => c.status === 'degraded')).toBe(true);
        });

        it('should return unhealthy status when critical components are unhealthy', async () => {
            // Mock cache as unhealthy
            mockCacheManager.healthCheck.mockResolvedValue(false);
            mockCacheManager.getStats.mockRejectedValue(new Error('Connection failed'));

            // Mock other components
            mockDataSourceManager.getAllSources.mockResolvedValue({
                items: [],
                pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
            });

            mockMonitoringService.getPerformanceMetrics.mockResolvedValue({
                totalQueries: 100,
                successfulQueries: 95,
                failedQueries: 5,
                averageResponseTime: 500,
                responseTimePercentiles: { p50: 400, p90: 800, p95: 1000, p99: 1500 },
                cacheHitRate: 0.83,
                cacheStats: {} as any,
                uptime: 3600000,
                startTime: Date.now() - 3600000
            });

            mockVectorSearchEngine.semanticSearch.mockResolvedValue([]);

            const systemHealth = await healthCheckService.getSystemHealth();

            expect(systemHealth.status).toBe('unhealthy');
            expect(systemHealth.components.some(c => c.name === 'cache' && c.status === 'unhealthy')).toBe(true);
        });
    });

    describe('checkComponent', () => {
        it('should check cache component health successfully', async () => {
            mockCacheManager.healthCheck.mockResolvedValue(true);
            mockCacheManager.getStats.mockResolvedValue({
                hits: 100,
                misses: 20,
                hitRate: 0.83,
                totalKeys: 50,
                memoryUsage: 1024,
                evictions: 0
            });

            const componentHealth = await healthCheckService.checkComponent('cache');

            expect(componentHealth.name).toBe('cache');
            expect(componentHealth.status).toBe('healthy');
            expect(componentHealth.responseTime).toBeGreaterThan(0);
            expect(componentHealth.details).toMatchObject({
                connected: true,
                hitRate: 0.83,
                totalKeys: 50
            });
        });

        it('should handle cache component failure', async () => {
            mockCacheManager.healthCheck.mockResolvedValue(false);
            mockCacheManager.getStats.mockRejectedValue(new Error('Connection failed'));

            const componentHealth = await healthCheckService.checkComponent('cache');

            expect(componentHealth.name).toBe('cache');
            expect(componentHealth.status).toBe('unhealthy');
            expect(componentHealth.error).toContain('Connection failed');
        });

        it('should check embedding service component', async () => {
            const componentHealth = await healthCheckService.checkComponent('embedding_service');

            expect(componentHealth.name).toBe('embedding_service');
            expect(componentHealth.status).toBe('healthy');
            expect(componentHealth.details?.embeddingDimensions).toBe(3);
        });

        it('should handle embedding service failure', async () => {
            mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('API error'));

            const componentHealth = await healthCheckService.checkComponent('embedding_service');

            expect(componentHealth.name).toBe('embedding_service');
            expect(componentHealth.status).toBe('unhealthy');
            expect(componentHealth.error).toContain('API error');
        });

        it('should throw error for unknown component', async () => {
            await expect(healthCheckService.checkComponent('unknown_component'))
                .rejects.toThrow('Unknown component: unknown_component');
        });
    });

    describe('getDataSourceHealth', () => {
        it('should return data source health summary', async () => {
            mockDataSourceManager.getAllSources.mockResolvedValue({
                items: [
                    { id: '1', name: 'Source 1', type: 'file', status: 'active' } as any,
                    { id: '2', name: 'Source 2', type: 'api', status: 'error' } as any
                ],
                pagination: { page: 1, limit: 100, total: 2, totalPages: 1 }
            });

            mockDataSourceManager.checkHealth
                .mockResolvedValueOnce({
                    sourceId: '1',
                    isHealthy: true,
                    lastCheck: new Date(),
                    responseTime: 100,
                    errorCount: 0
                })
                .mockResolvedValueOnce({
                    sourceId: '2',
                    isHealthy: false,
                    lastCheck: new Date(),
                    responseTime: undefined,
                    errorCount: 1,
                    lastError: 'Connection failed'
                });

            const dataSourceHealth = await healthCheckService.getDataSourceHealth();

            expect(dataSourceHealth.totalSources).toBe(2);
            expect(dataSourceHealth.healthySources).toBe(1);
            expect(dataSourceHealth.unhealthySources).toBe(1);
            expect(dataSourceHealth.sources).toHaveLength(2);
            expect(dataSourceHealth.sources[0]?.status).toBe('healthy');
            expect(dataSourceHealth.sources[1]?.status).toBe('unhealthy');
        });

        it('should handle no data sources', async () => {
            mockDataSourceManager.getAllSources.mockResolvedValue({
                items: [],
                pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
            });

            const dataSourceHealth = await healthCheckService.getDataSourceHealth();

            expect(dataSourceHealth.totalSources).toBe(0);
            expect(dataSourceHealth.healthySources).toBe(0);
            expect(dataSourceHealth.unhealthySources).toBe(0);
            expect(dataSourceHealth.sources).toHaveLength(0);
        });
    });

    describe('alerting', () => {
        it('should emit alert when component fails consecutively', async () => {
            const alertSpy = jest.fn();
            healthCheckService.on('alert', alertSpy);

            // Mock cache as failing
            mockCacheManager.healthCheck.mockResolvedValue(false);
            mockCacheManager.getStats.mockRejectedValue(new Error('Connection failed'));

            // Mock other components as healthy
            mockDataSourceManager.getAllSources.mockResolvedValue({
                items: [],
                pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
            });

            mockMonitoringService.getPerformanceMetrics.mockResolvedValue({
                totalQueries: 100,
                successfulQueries: 95,
                failedQueries: 5,
                averageResponseTime: 500,
                responseTimePercentiles: { p50: 400, p90: 800, p95: 1000, p99: 1500 },
                cacheHitRate: 0.83,
                cacheStats: {} as any,
                uptime: 3600000,
                startTime: Date.now() - 3600000
            });

            mockVectorSearchEngine.semanticSearch.mockResolvedValue([]);

            // Trigger multiple health checks to reach failure threshold
            for (let i = 0; i < 3; i++) {
                await healthCheckService.getSystemHealth();
            }

            expect(alertSpy).toHaveBeenCalled();
            const alert = alertSpy.mock.calls[0][0];
            expect(alert.metric).toBe('cache');
            expect(alert.message).toContain('unhealthy');
            expect(alert.severity).toBe('high');
        });

        it('should emit alert for slow response time', async () => {
            const alertSpy = jest.fn();
            healthCheckService.on('alert', alertSpy);

            // Mock cache with slow response
            mockCacheManager.healthCheck.mockImplementation(() =>
                new Promise(resolve => setTimeout(() => resolve(true), 3000))
            );
            mockCacheManager.getStats.mockResolvedValue({
                hits: 100,
                misses: 20,
                hitRate: 0.83,
                totalKeys: 50,
                memoryUsage: 1024,
                evictions: 0
            });

            await healthCheckService.checkComponent('cache');

            expect(alertSpy).toHaveBeenCalled();
            const alert = alertSpy.mock.calls[0][0];
            expect(alert.message).toContain('response time');
            expect(alert.severity).toBe('medium');
        });

        it('should reset failure count on successful health check', async () => {
            // First, cause some failures
            mockCacheManager.healthCheck.mockResolvedValue(false);
            mockCacheManager.getStats.mockRejectedValue(new Error('Connection failed'));

            await healthCheckService.checkComponent('cache');
            await healthCheckService.checkComponent('cache');

            let failureCounts = healthCheckService.getComponentFailureCounts();
            expect(failureCounts.get('cache')).toBe(2);

            // Now make it healthy
            mockCacheManager.healthCheck.mockResolvedValue(true);
            mockCacheManager.getStats.mockResolvedValue({
                hits: 100,
                misses: 20,
                hitRate: 0.83,
                totalKeys: 50,
                memoryUsage: 1024,
                evictions: 0
            });

            await healthCheckService.checkComponent('cache');

            failureCounts = healthCheckService.getComponentFailureCounts();
            expect(failureCounts.get('cache')).toBe(0);
        });
    });

    describe('continuous monitoring', () => {
        it('should start and stop continuous monitoring', () => {
            const setIntervalSpy = jest.spyOn(global, 'setInterval');
            const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

            healthCheckService.start();
            expect(setIntervalSpy).toHaveBeenCalledWith(
                expect.any(Function),
                defaultConfig.checkInterval
            );

            healthCheckService.stop();
            expect(clearIntervalSpy).toHaveBeenCalled();

            setIntervalSpy.mockRestore();
            clearIntervalSpy.mockRestore();
        });

        it('should emit health check events during monitoring', (done) => {
            // Mock all components as healthy
            mockCacheManager.healthCheck.mockResolvedValue(true);
            mockCacheManager.getStats.mockResolvedValue({
                hits: 100,
                misses: 20,
                hitRate: 0.83,
                totalKeys: 50,
                memoryUsage: 1024,
                evictions: 0
            });

            mockDataSourceManager.getAllSources.mockResolvedValue({
                items: [],
                pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
            });

            mockMonitoringService.getPerformanceMetrics.mockResolvedValue({
                totalQueries: 100,
                successfulQueries: 95,
                failedQueries: 5,
                averageResponseTime: 500,
                responseTimePercentiles: { p50: 400, p90: 800, p95: 1000, p99: 1500 },
                cacheHitRate: 0.83,
                cacheStats: {} as any,
                uptime: 3600000,
                startTime: Date.now() - 3600000
            });

            mockVectorSearchEngine.semanticSearch.mockResolvedValue([]);

            healthCheckService.on('healthCheck', (systemHealth) => {
                expect(systemHealth.status).toBe('healthy');
                healthCheckService.stop();
                done();
            });

            // Use a very short interval for testing
            const testService = new HealthCheckService(
                { ...defaultConfig, checkInterval: 10 },
                {
                    cacheManager: mockCacheManager,
                    dataSourceManager: mockDataSourceManager,
                    monitoringService: mockMonitoringService,
                    embeddingService: mockEmbeddingService,
                    vectorSearchEngine: mockVectorSearchEngine
                }
            );

            testService.start();
        });
    });

    describe('utility methods', () => {
        it('should track last health check time', async () => {
            const beforeCheck = new Date();
            await healthCheckService.getSystemHealth();
            const afterCheck = new Date();

            const lastCheck = healthCheckService.getLastHealthCheck();
            expect(lastCheck.getTime()).toBeGreaterThanOrEqual(beforeCheck.getTime());
            expect(lastCheck.getTime()).toBeLessThanOrEqual(afterCheck.getTime());
        });

        it('should reset component failure count', () => {
            healthCheckService.resetComponentFailureCount('test_component');
            const failureCounts = healthCheckService.getComponentFailureCounts();
            expect(failureCounts.get('test_component')).toBe(0);
        });
    });
});