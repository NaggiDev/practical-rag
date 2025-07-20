import { CacheManager } from '../cache';
import { CacheWarmingConfig, CacheWarmingService } from '../cacheWarming';

// Mock CacheManager
jest.mock('../cache');
const MockedCacheManager = CacheManager as jest.MockedClass<typeof CacheManager>;

describe('CacheWarmingService', () => {
    let cacheWarmingService: CacheWarmingService;
    let mockCacheManager: jest.Mocked<CacheManager>;
    let config: CacheWarmingConfig;

    beforeEach(() => {
        config = {
            enabled: true,
            maxWarmingQueries: 10,
            warmingInterval: 60000,
            popularityThreshold: 3,
            maxAge: 3600000,
            preloadBatchSize: 5
        };

        mockCacheManager = {
            getCachedQueryResult: jest.fn(),
            invalidateQueryCache: jest.fn(),
            invalidateContentCache: jest.fn(),
        } as any;

        MockedCacheManager.mockImplementation(() => mockCacheManager);
        cacheWarmingService = new CacheWarmingService(mockCacheManager, config);
    });

    afterEach(() => {
        cacheWarmingService.stop();
        jest.clearAllMocks();
    });

    describe('Query Usage Tracking', () => {
        it('should track new query usage', () => {
            const queryHash = 'test-query-hash';
            const processingTime = 150;
            const sources = ['source1', 'source2'];

            cacheWarmingService.trackQueryUsage(queryHash, processingTime, sources);

            const stats = cacheWarmingService.getWarmingStats();
            expect(stats.totalTrackedQueries).toBe(1);
        });

        it('should update existing query usage', () => {
            const queryHash = 'test-query-hash';
            const sources1 = ['source1'];
            const sources2 = ['source2'];

            cacheWarmingService.trackQueryUsage(queryHash, 100, sources1);
            cacheWarmingService.trackQueryUsage(queryHash, 200, sources2);

            const stats = cacheWarmingService.getWarmingStats();
            expect(stats.totalTrackedQueries).toBe(1);
        });
    });

    describe('Popular Queries Identification', () => {
        beforeEach(() => {
            // Track multiple queries with different frequencies
            for (let i = 0; i < 4; i++) {
                cacheWarmingService.trackQueryUsage('popular-query-1', 100, ['source1']);
            }
            for (let i = 0; i < 3; i++) {
                cacheWarmingService.trackQueryUsage('popular-query-2', 200, ['source2']);
            }
            cacheWarmingService.trackQueryUsage('unpopular-query', 300, ['source3']);
        });

        it('should identify popular queries above threshold', () => {
            const popularQueries = cacheWarmingService.getPopularQueries();

            expect(popularQueries).toContain('popular-query-1');
            expect(popularQueries).toContain('popular-query-2');
            expect(popularQueries).not.toContain('unpopular-query');
        });

        it('should limit number of popular queries returned', () => {
            const popularQueries = cacheWarmingService.getPopularQueries(1);

            expect(popularQueries).toHaveLength(1);
            expect(popularQueries[0]).toBe('popular-query-1');
        });
    });

    describe('Hot Data Preloading', () => {
        beforeEach(() => {
            // Set up popular queries
            for (let i = 0; i < 4; i++) {
                cacheWarmingService.trackQueryUsage('hot-query-1', 100, ['source1']);
                cacheWarmingService.trackQueryUsage('hot-query-2', 200, ['source2']);
            }
        });

        it('should preload hot data for popular queries', async () => {
            mockCacheManager.getCachedQueryResult.mockResolvedValue(null);

            await cacheWarmingService.preloadHotData();

            expect(mockCacheManager.getCachedQueryResult).toHaveBeenCalledWith('hot-query-1');
            expect(mockCacheManager.getCachedQueryResult).toHaveBeenCalledWith('hot-query-2');
        });

        it('should skip already cached queries', async () => {
            mockCacheManager.getCachedQueryResult.mockResolvedValue({
                id: 'cached-result',
                response: 'cached response',
                sources: [],
                confidence: 0.9,
                processingTime: 50,
                cached: true
            });

            await cacheWarmingService.preloadHotData();

            expect(mockCacheManager.getCachedQueryResult).toHaveBeenCalled();
        });
    });

    describe('Cache Invalidation for Data Source Updates', () => {
        beforeEach(() => {
            cacheWarmingService.trackQueryUsage('query-source1', 100, ['source1']);
            cacheWarmingService.trackQueryUsage('query-source2', 200, ['source2']);
            cacheWarmingService.trackQueryUsage('query-both', 300, ['source1', 'source2']);
        });

        it('should invalidate cache for affected queries', async () => {
            mockCacheManager.invalidateQueryCache.mockResolvedValue(2);
            mockCacheManager.invalidateContentCache.mockResolvedValue(1);

            await cacheWarmingService.invalidateForDataSourceUpdate('source1');

            expect(mockCacheManager.invalidateQueryCache).toHaveBeenCalledWith('query:query-source1*');
            expect(mockCacheManager.invalidateQueryCache).toHaveBeenCalledWith('query:query-both*');
            expect(mockCacheManager.invalidateContentCache).toHaveBeenCalledWith('source1');
        });

        it('should remove usage stats for invalidated queries', async () => {
            mockCacheManager.invalidateQueryCache.mockResolvedValue(1);
            mockCacheManager.invalidateContentCache.mockResolvedValue(1);

            const initialStats = cacheWarmingService.getWarmingStats();
            expect(initialStats.totalTrackedQueries).toBe(3);

            await cacheWarmingService.invalidateForDataSourceUpdate('source1');

            const finalStats = cacheWarmingService.getWarmingStats();
            expect(finalStats.totalTrackedQueries).toBe(1);
        });
    });

    describe('Intelligent Cache Warming', () => {
        it('should perform cache warming when enabled', async () => {
            jest.spyOn(cacheWarmingService, 'preloadHotData').mockResolvedValue();

            await cacheWarmingService.performCacheWarming();

            expect(cacheWarmingService.preloadHotData).toHaveBeenCalled();
        });

        it('should skip warming when disabled', async () => {
            config.enabled = false;
            const disabledService = new CacheWarmingService(mockCacheManager, config);
            jest.spyOn(disabledService, 'preloadHotData').mockResolvedValue();

            await disabledService.performCacheWarming();

            expect(disabledService.preloadHotData).not.toHaveBeenCalled();
        });
    });

    describe('Statistics and Monitoring', () => {
        beforeEach(() => {
            for (let i = 0; i < 5; i++) {
                cacheWarmingService.trackQueryUsage('popular-query', 100, ['source1']);
            }
            cacheWarmingService.trackQueryUsage('unpopular-query', 200, ['source2']);
        });

        it('should provide warming statistics', () => {
            const stats = cacheWarmingService.getWarmingStats();

            expect(stats.totalTrackedQueries).toBe(2);
            expect(stats.popularQueries).toBe(1);
            expect(stats.isWarming).toBe(false);
            expect(Array.isArray(stats.topPatterns)).toBe(true);
        });

        it('should track query patterns', () => {
            const stats = cacheWarmingService.getWarmingStats();

            expect(stats.topPatterns.length).toBeGreaterThan(0);
            expect(stats.topPatterns[0]).toHaveProperty('pattern');
            expect(stats.topPatterns[0]).toHaveProperty('frequency');
            expect(stats.topPatterns[0]).toHaveProperty('priority');
        });
    });

    describe('Configuration Management', () => {
        it('should return current configuration', () => {
            const currentConfig = cacheWarmingService.getConfig();

            expect(currentConfig).toEqual(config);
            expect(currentConfig).not.toBe(config);
        });

        it('should update configuration', () => {
            const updates = {
                maxWarmingQueries: 20,
                popularityThreshold: 5
            };

            cacheWarmingService.updateConfig(updates);

            const updatedConfig = cacheWarmingService.getConfig();
            expect(updatedConfig.maxWarmingQueries).toBe(20);
            expect(updatedConfig.popularityThreshold).toBe(5);
            expect(updatedConfig.enabled).toBe(true);
        });

        it('should report enabled status', () => {
            expect(cacheWarmingService.isEnabled()).toBe(true);

            cacheWarmingService.updateConfig({ enabled: false });
            expect(cacheWarmingService.isEnabled()).toBe(false);
        });
    });

    describe('Service Lifecycle', () => {
        it('should start and stop service', () => {
            expect(() => {
                cacheWarmingService.start();
                cacheWarmingService.stop();
            }).not.toThrow();
        });

        it('should handle multiple start calls', () => {
            expect(() => {
                cacheWarmingService.start();
                cacheWarmingService.start();
                cacheWarmingService.stop();
            }).not.toThrow();
        });
    });
});