import Redis from 'ioredis';
import { CacheConfig } from '../../models/config';
import { QueryResult } from '../../models/query';
import { CacheManager } from '../cache';

// Mock Redis
jest.mock('ioredis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('CacheManager', () => {
    let cacheManager: CacheManager;
    let mockRedis: jest.Mocked<Redis>;
    let config: CacheConfig;

    beforeEach(() => {
        config = {
            redis: {
                host: 'localhost',
                port: 6379,
                password: undefined,
                db: 0
            },
            ttl: {
                queryResults: 3600,
                embeddings: 86400,
                healthChecks: 300
            },
            maxMemory: '256mb',
            evictionPolicy: 'allkeys-lru'
        };

        mockRedis = {
            connect: jest.fn().mockResolvedValue(undefined),
            quit: jest.fn().mockResolvedValue(undefined),
            config: jest.fn().mockResolvedValue('OK'),
            get: jest.fn(),
            set: jest.fn(),
            setex: jest.fn(),
            mget: jest.fn(),
            del: jest.fn(),
            keys: jest.fn(),
            flushdb: jest.fn(),
            dbsize: jest.fn(),
            info: jest.fn(),
            ping: jest.fn().mockResolvedValue('PONG'),
            pipeline: jest.fn().mockReturnValue({
                setex: jest.fn().mockReturnThis(),
                exec: jest.fn().mockResolvedValue([])
            }),
            on: jest.fn()
        } as any;

        MockedRedis.mockImplementation(() => mockRedis);
        cacheManager = new CacheManager(config);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Connection Management', () => {
        it('should connect to Redis successfully', async () => {
            await cacheManager.connect();

            expect(mockRedis.connect).toHaveBeenCalled();
            expect(mockRedis.config).toHaveBeenCalledWith('SET', 'maxmemory', '256mb');
            expect(mockRedis.config).toHaveBeenCalledWith('SET', 'maxmemory-policy', 'allkeys-lru');
        });

        it('should handle connection errors', async () => {
            mockRedis.connect.mockRejectedValue(new Error('Connection failed'));

            await expect(cacheManager.connect()).rejects.toThrow('Failed to connect to Redis: Connection failed');
        });

        it('should disconnect from Redis', async () => {
            await cacheManager.disconnect();

            expect(mockRedis.quit).toHaveBeenCalled();
        });

        it('should perform health check', async () => {
            const isHealthy = await cacheManager.healthCheck();

            expect(mockRedis.ping).toHaveBeenCalled();
            expect(isHealthy).toBe(true);
        });

        it('should handle health check failure', async () => {
            mockRedis.ping.mockRejectedValue(new Error('Ping failed'));

            const isHealthy = await cacheManager.healthCheck();

            expect(isHealthy).toBe(false);
        });
    });

    describe('Query Result Caching', () => {
        const queryHash = 'test-query-hash';
        const queryResult: QueryResult = {
            id: 'result-1',
            response: 'Test response',
            sources: [],
            confidence: 0.9,
            processingTime: 100,
            cached: false
        };

        beforeEach(() => {
            // Simulate connected state
            (cacheManager as any).isConnected = true;
        });

        it('should cache query result successfully', async () => {
            await cacheManager.setCachedQueryResult(queryHash, queryResult);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'query:test-query-hash',
                3600,
                JSON.stringify({ ...queryResult, cached: true })
            );
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'query:test-query-hash:meta',
                3600,
                expect.stringContaining('"ttl":3600')
            );
        });

        it('should retrieve cached query result', async () => {
            const cachedResult = { ...queryResult, cached: true };
            mockRedis.get.mockResolvedValue(JSON.stringify(cachedResult));

            const result = await cacheManager.getCachedQueryResult(queryHash);

            expect(mockRedis.get).toHaveBeenCalledWith('query:test-query-hash');
            expect(result).toEqual(cachedResult);
        });

        it('should return null for cache miss', async () => {
            mockRedis.get.mockResolvedValue(null);

            const result = await cacheManager.getCachedQueryResult(queryHash);

            expect(result).toBeNull();
        });

        it('should use custom TTL when provided', async () => {
            const customTtl = 7200;
            await cacheManager.setCachedQueryResult(queryHash, queryResult, customTtl);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'query:test-query-hash',
                customTtl,
                expect.any(String)
            );
        });

        it('should handle caching errors gracefully', async () => {
            mockRedis.setex.mockRejectedValue(new Error('Redis error'));

            await expect(cacheManager.setCachedQueryResult(queryHash, queryResult)).resolves.not.toThrow();
        });
    });

    describe('Embedding Caching', () => {
        const textHash = 'text-hash-123';
        const embedding = [0.1, 0.2, 0.3, 0.4, 0.5];

        beforeEach(() => {
            (cacheManager as any).isConnected = true;
        });

        it('should cache embedding successfully', async () => {
            await cacheManager.setCachedEmbedding(textHash, embedding);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'embedding:text-hash-123',
                86400,
                JSON.stringify(embedding)
            );
        });

        it('should retrieve cached embedding', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify(embedding));

            const result = await cacheManager.getCachedEmbedding(textHash);

            expect(mockRedis.get).toHaveBeenCalledWith('embedding:text-hash-123');
            expect(result).toEqual(embedding);
        });

        it('should handle batch embedding operations', async () => {
            const textHashes = ['hash1', 'hash2', 'hash3'];
            const embeddings = new Map([
                ['hash1', [0.1, 0.2]],
                ['hash2', [0.3, 0.4]],
                ['hash3', [0.5, 0.6]]
            ]);

            // Test batch set
            await cacheManager.setCachedEmbeddings(embeddings);

            expect(mockRedis.pipeline).toHaveBeenCalled();

            // Test batch get
            mockRedis.mget.mockResolvedValue([
                JSON.stringify([0.1, 0.2]),
                JSON.stringify([0.3, 0.4]),
                null
            ]);

            const results = await cacheManager.getCachedEmbeddings(textHashes);

            expect(mockRedis.mget).toHaveBeenCalledWith(
                'embedding:hash1',
                'embedding:hash2',
                'embedding:hash3'
            );
            expect(results.size).toBe(2);
            expect(results.get('hash1')).toEqual([0.1, 0.2]);
            expect(results.get('hash2')).toEqual([0.3, 0.4]);
            expect(results.has('hash3')).toBe(false);
        });
    });

    describe('Processed Content Caching', () => {
        const contentId = 'content-123';
        const processedContent = {
            title: 'Test Document',
            chunks: ['chunk1', 'chunk2'],
            metadata: { author: 'Test Author' }
        };

        beforeEach(() => {
            (cacheManager as any).isConnected = true;
        });

        it('should cache processed content', async () => {
            await cacheManager.setCachedProcessedContent(contentId, processedContent);

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'content:content-123',
                86400,
                JSON.stringify(processedContent)
            );
        });

        it('should retrieve cached processed content', async () => {
            mockRedis.get.mockResolvedValue(JSON.stringify(processedContent));

            const result = await cacheManager.getCachedProcessedContent(contentId);

            expect(mockRedis.get).toHaveBeenCalledWith('content:content-123');
            expect(result).toEqual(processedContent);
        });
    });

    describe('Cache Invalidation', () => {
        beforeEach(() => {
            (cacheManager as any).isConnected = true;
        });

        it('should invalidate query cache', async () => {
            mockRedis.keys.mockResolvedValue(['query:hash1', 'query:hash2']);
            mockRedis.del.mockResolvedValue(2);

            const deleted = await cacheManager.invalidateQueryCache();

            expect(mockRedis.keys).toHaveBeenCalledWith('query:*');
            expect(mockRedis.del).toHaveBeenCalledWith('query:hash1', 'query:hash2');
            expect(deleted).toBe(2);
        });

        it('should invalidate embedding cache with pattern', async () => {
            mockRedis.keys.mockResolvedValue(['embedding:specific-hash']);
            mockRedis.del.mockResolvedValue(1);

            const deleted = await cacheManager.invalidateEmbeddingCache('embedding:specific-*');

            expect(mockRedis.keys).toHaveBeenCalledWith('embedding:specific-*');
            expect(deleted).toBe(1);
        });

        it('should invalidate content cache for specific content', async () => {
            mockRedis.keys.mockResolvedValue(['content:123', 'content:123:meta']);
            mockRedis.del.mockResolvedValue(2);

            const deleted = await cacheManager.invalidateContentCache('123');

            expect(mockRedis.keys).toHaveBeenCalledWith('content:123*');
            expect(deleted).toBe(2);
        });

        it('should clear all cache', async () => {
            await cacheManager.clearAllCache();

            expect(mockRedis.flushdb).toHaveBeenCalled();
        });
    });

    describe('Cache Statistics', () => {
        beforeEach(() => {
            (cacheManager as any).isConnected = true;
        });

        it('should get cache statistics', async () => {
            mockRedis.info.mockResolvedValue('used_memory:1048576\nevicted_keys:10\n');
            mockRedis.dbsize.mockResolvedValue(100);

            const stats = await cacheManager.getStats();

            expect(stats.memoryUsage).toBe(1048576);
            expect(stats.evictions).toBe(10);
            expect(stats.totalKeys).toBe(100);
        });

        it('should track hit and miss rates', async () => {
            // Simulate cache hits and misses
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({ test: 'data' }));
            mockRedis.get.mockResolvedValueOnce(null);
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({ test: 'data2' }));

            await cacheManager.getCachedQueryResult('hash1'); // hit
            await cacheManager.getCachedQueryResult('hash2'); // miss
            await cacheManager.getCachedQueryResult('hash3'); // hit

            const stats = await cacheManager.getStats();

            expect(stats.hits).toBe(2);
            expect(stats.misses).toBe(1);
            expect(stats.hitRate).toBeCloseTo(0.67, 2);
        });
    });

    describe('Error Handling', () => {
        it('should handle disconnected state gracefully', async () => {
            (cacheManager as any).isConnected = false;

            const result = await cacheManager.getCachedQueryResult('test');
            expect(result).toBeNull();

            await cacheManager.setCachedQueryResult('test', {} as QueryResult);
            // Should not throw
        });

        it('should handle Redis errors in get operations', async () => {
            (cacheManager as any).isConnected = true;
            mockRedis.get.mockRejectedValue(new Error('Redis error'));

            const result = await cacheManager.getCachedQueryResult('test');

            expect(result).toBeNull();
        });

        it('should handle Redis errors in set operations', async () => {
            (cacheManager as any).isConnected = true;
            mockRedis.setex.mockRejectedValue(new Error('Redis error'));

            await expect(cacheManager.setCachedQueryResult('test', {} as QueryResult)).resolves.not.toThrow();
        });
    });

    describe('LRU Eviction Policy', () => {
        beforeEach(() => {
            (cacheManager as any).isConnected = true;
        });

        it('should configure LRU eviction policy', async () => {
            await cacheManager.connect();

            expect(mockRedis.config).toHaveBeenCalledWith('SET', 'maxmemory-policy', 'allkeys-lru');
        });

        it('should track access patterns for LRU', async () => {
            const queryHash = 'test-hash';
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({ test: 'data' }));
            mockRedis.get.mockResolvedValueOnce(JSON.stringify({
                timestamp: Date.now(),
                ttl: 3600,
                accessCount: 5,
                lastAccessed: Date.now() - 1000
            }));

            await cacheManager.getCachedQueryResult(queryHash);

            expect(mockRedis.get).toHaveBeenCalledWith('query:test-hash:meta');
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'query:test-hash:meta',
                expect.any(Number),
                expect.stringContaining('"accessCount":6')
            );
        });
    });

    describe('TTL Management', () => {
        beforeEach(() => {
            (cacheManager as any).isConnected = true;
        });

        it('should use different TTLs for different cache types', async () => {
            const queryResult: QueryResult = {
                id: 'test',
                response: 'test',
                sources: [],
                confidence: 0.9,
                processingTime: 100,
                cached: false
            };

            await cacheManager.setCachedQueryResult('query-hash', queryResult);
            await cacheManager.setCachedEmbedding('text-hash', [0.1, 0.2]);
            await cacheManager.setCachedProcessedContent('content-id', { test: 'data' });

            expect(mockRedis.setex).toHaveBeenCalledWith(
                'query:query-hash',
                3600, // queryResults TTL
                expect.any(String)
            );
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'embedding:text-hash',
                86400, // embeddings TTL
                expect.any(String)
            );
            expect(mockRedis.setex).toHaveBeenCalledWith(
                'content:content-id',
                86400, // embeddings TTL (used for processed content)
                expect.any(String)
            );
        });
    });
});