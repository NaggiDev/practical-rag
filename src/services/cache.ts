import Redis from 'ioredis';
import { CacheConfig } from '../models/config';
import { QueryResult } from '../models/query';

export interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
    accessCount: number;
    lastAccessed: number;
}

export interface CacheStats {
    hits: number;
    misses: number;
    hitRate: number;
    totalKeys: number;
    memoryUsage: number;
    evictions: number;
}

export class CacheManager {
    private redis: Redis;
    private config: CacheConfig;
    private stats: CacheStats;
    private isConnected: boolean = false;

    constructor(config: CacheConfig) {
        this.config = config;
        this.stats = {
            hits: 0,
            misses: 0,
            hitRate: 0,
            totalKeys: 0,
            memoryUsage: 0,
            evictions: 0
        };

        this.redis = new Redis({
            host: config.redis.host,
            port: config.redis.port,
            password: config.redis.password,
            db: config.redis.db,
            maxRetriesPerRequest: 3,
            lazyConnect: true,
            keepAlive: 30000,
            connectTimeout: 10000,
            commandTimeout: 5000
        });

        this.setupEventHandlers();
    }

    private setupEventHandlers(): void {
        this.redis.on('connect', () => {
            console.log('Redis cache connected');
            this.isConnected = true;
        });

        this.redis.on('error', (error) => {
            console.error('Redis cache error:', error);
            this.isConnected = false;
        });

        this.redis.on('close', () => {
            console.log('Redis cache connection closed');
            this.isConnected = false;
        });

        this.redis.on('reconnecting', () => {
            console.log('Redis cache reconnecting...');
        });
    }

    public async connect(): Promise<void> {
        try {
            await this.redis.connect();
            await this.configureRedis();
        } catch (error) {
            throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async configureRedis(): Promise<void> {
        try {
            // Configure Redis memory settings
            await this.redis.config('SET', 'maxmemory', this.config.maxMemory);
            await this.redis.config('SET', 'maxmemory-policy', this.config.evictionPolicy);

            console.log(`Redis configured with maxmemory: ${this.config.maxMemory}, policy: ${this.config.evictionPolicy}`);
        } catch (error) {
            console.warn('Failed to configure Redis settings:', error);
        }
    }

    public async disconnect(): Promise<void> {
        if (this.redis) {
            await this.redis.quit();
            this.isConnected = false;
        }
    }

    // Query result caching
    public async getCachedQueryResult(queryHash: string): Promise<QueryResult | null> {
        if (!this.isConnected) return null;

        try {
            const key = this.getQueryResultKey(queryHash);
            const cached = await this.redis.get(key);

            if (cached) {
                this.stats.hits++;
                await this.updateAccessStats(key);
                return JSON.parse(cached) as QueryResult;
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            console.error('Error getting cached query result:', error);
            this.stats.misses++;
            return null;
        } finally {
            this.updateHitRate();
        }
    }

    public async setCachedQueryResult(queryHash: string, result: QueryResult, customTtl?: number): Promise<void> {
        if (!this.isConnected) return;

        try {
            const key = this.getQueryResultKey(queryHash);
            const ttl = customTtl || this.config.ttl.queryResults;
            const cacheEntry: CacheEntry<QueryResult> = {
                data: { ...result, cached: true },
                timestamp: Date.now(),
                ttl,
                accessCount: 0,
                lastAccessed: Date.now()
            };

            await this.redis.setex(key, ttl, JSON.stringify(cacheEntry.data));
            await this.redis.setex(`${key}:meta`, ttl, JSON.stringify({
                timestamp: cacheEntry.timestamp,
                ttl: cacheEntry.ttl,
                accessCount: cacheEntry.accessCount,
                lastAccessed: cacheEntry.lastAccessed
            }));
        } catch (error) {
            console.error('Error setting cached query result:', error);
        }
    }

    // Embedding caching
    public async getCachedEmbedding(textHash: string): Promise<number[] | null> {
        if (!this.isConnected) return null;

        try {
            const key = this.getEmbeddingKey(textHash);
            const cached = await this.redis.get(key);

            if (cached) {
                this.stats.hits++;
                await this.updateAccessStats(key);
                return JSON.parse(cached) as number[];
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            console.error('Error getting cached embedding:', error);
            this.stats.misses++;
            return null;
        } finally {
            this.updateHitRate();
        }
    }

    public async setCachedEmbedding(textHash: string, embedding: number[], customTtl?: number): Promise<void> {
        if (!this.isConnected) return;

        try {
            const key = this.getEmbeddingKey(textHash);
            const ttl = customTtl || this.config.ttl.embeddings;

            await this.redis.setex(key, ttl, JSON.stringify(embedding));
            await this.redis.setex(`${key}:meta`, ttl, JSON.stringify({
                timestamp: Date.now(),
                ttl,
                accessCount: 0,
                lastAccessed: Date.now()
            }));
        } catch (error) {
            console.error('Error setting cached embedding:', error);
        }
    }

    // Batch embedding operations
    public async getCachedEmbeddings(textHashes: string[]): Promise<Map<string, number[]>> {
        const results = new Map<string, number[]>();

        if (!this.isConnected || textHashes.length === 0) return results;

        try {
            const keys = textHashes.map(hash => this.getEmbeddingKey(hash));
            const cached = await this.redis.mget(...keys);

            for (let i = 0; i < textHashes.length; i++) {
                const textHash = textHashes[i];
                const cachedValue = cached[i];
                const key = keys[i];
                if (cachedValue && textHash && key) {
                    results.set(textHash, JSON.parse(cachedValue));
                    this.stats.hits++;
                    await this.updateAccessStats(key);
                } else {
                    this.stats.misses++;
                }
            }
        } catch (error) {
            console.error('Error getting cached embeddings:', error);
        } finally {
            this.updateHitRate();
        }

        return results;
    }

    public async setCachedEmbeddings(embeddings: Map<string, number[]>, customTtl?: number): Promise<void> {
        if (!this.isConnected || embeddings.size === 0) return;

        try {
            const ttl = customTtl || this.config.ttl.embeddings;
            const pipeline = this.redis.pipeline();

            for (const [textHash, embedding] of embeddings) {
                const key = this.getEmbeddingKey(textHash);
                pipeline.setex(key, ttl, JSON.stringify(embedding));
                pipeline.setex(`${key}:meta`, ttl, JSON.stringify({
                    timestamp: Date.now(),
                    ttl,
                    accessCount: 0,
                    lastAccessed: Date.now()
                }));
            }

            await pipeline.exec();
        } catch (error) {
            console.error('Error setting cached embeddings:', error);
        }
    }

    // Processed content caching
    public async getCachedProcessedContent(contentId: string): Promise<any | null> {
        if (!this.isConnected) return null;

        try {
            const key = this.getProcessedContentKey(contentId);
            const cached = await this.redis.get(key);

            if (cached) {
                this.stats.hits++;
                await this.updateAccessStats(key);
                return JSON.parse(cached);
            } else {
                this.stats.misses++;
                return null;
            }
        } catch (error) {
            console.error('Error getting cached processed content:', error);
            this.stats.misses++;
            return null;
        } finally {
            this.updateHitRate();
        }
    }

    public async setCachedProcessedContent(contentId: string, content: any, customTtl?: number): Promise<void> {
        if (!this.isConnected) return;

        try {
            const key = this.getProcessedContentKey(contentId);
            const ttl = customTtl || this.config.ttl.embeddings; // Use embedding TTL for processed content

            await this.redis.setex(key, ttl, JSON.stringify(content));
            await this.redis.setex(`${key}:meta`, ttl, JSON.stringify({
                timestamp: Date.now(),
                ttl,
                accessCount: 0,
                lastAccessed: Date.now()
            }));
        } catch (error) {
            console.error('Error setting cached processed content:', error);
        }
    }

    // Cache invalidation
    public async invalidateQueryCache(pattern?: string): Promise<number> {
        if (!this.isConnected) return 0;

        try {
            const searchPattern = pattern || 'query:*';
            const keys = await this.redis.keys(searchPattern);

            if (keys.length > 0) {
                const deleted = await this.redis.del(...keys);
                console.log(`Invalidated ${deleted} query cache entries`);
                return deleted;
            }
            return 0;
        } catch (error) {
            console.error('Error invalidating query cache:', error);
            return 0;
        }
    }

    public async invalidateEmbeddingCache(pattern?: string): Promise<number> {
        if (!this.isConnected) return 0;

        try {
            const searchPattern = pattern || 'embedding:*';
            const keys = await this.redis.keys(searchPattern);

            if (keys.length > 0) {
                const deleted = await this.redis.del(...keys);
                console.log(`Invalidated ${deleted} embedding cache entries`);
                return deleted;
            }
            return 0;
        } catch (error) {
            console.error('Error invalidating embedding cache:', error);
            return 0;
        }
    }

    public async invalidateContentCache(contentId?: string): Promise<number> {
        if (!this.isConnected) return 0;

        try {
            const searchPattern = contentId ? `content:${contentId}*` : 'content:*';
            const keys = await this.redis.keys(searchPattern);

            if (keys.length > 0) {
                const deleted = await this.redis.del(...keys);
                console.log(`Invalidated ${deleted} content cache entries`);
                return deleted;
            }
            return 0;
        } catch (error) {
            console.error('Error invalidating content cache:', error);
            return 0;
        }
    }

    // Cache statistics and monitoring
    public async getStats(): Promise<CacheStats> {
        if (!this.isConnected) return this.stats;

        try {
            const info = await this.redis.info('memory');
            const memoryMatch = info.match(/used_memory:(\d+)/);
            const evictionsMatch = info.match(/evicted_keys:(\d+)/);

            this.stats.memoryUsage = memoryMatch ? parseInt(memoryMatch[1] as string) : 0;
            this.stats.evictions = evictionsMatch ? parseInt(evictionsMatch[1] as string) : 0;
            this.stats.totalKeys = await this.redis.dbsize();

            return { ...this.stats };
        } catch (error) {
            console.error('Error getting cache stats:', error);
            return this.stats;
        }
    }

    public async clearAllCache(): Promise<void> {
        if (!this.isConnected) return;

        try {
            await this.redis.flushdb();
            this.resetStats();
            console.log('All cache cleared');
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }

    // Health check
    public async healthCheck(): Promise<boolean> {
        try {
            const result = await this.redis.ping();
            return result === 'PONG';
        } catch (error) {
            console.error('Cache health check failed:', error);
            return false;
        }
    }

    // Private helper methods
    private getQueryResultKey(queryHash: string): string {
        return `query:${queryHash}`;
    }

    private getEmbeddingKey(textHash: string): string {
        return `embedding:${textHash}`;
    }

    private getProcessedContentKey(contentId: string): string {
        return `content:${contentId}`;
    }

    private async updateAccessStats(key: string): Promise<void> {
        try {
            const metaKey = `${key}:meta`;
            const meta = await this.redis.get(metaKey);

            if (meta) {
                const metaData = JSON.parse(meta);
                metaData.accessCount++;
                metaData.lastAccessed = Date.now();

                await this.redis.setex(metaKey, metaData.ttl, JSON.stringify(metaData));
            }
        } catch (error) {
            // Silently fail for access stats to not impact performance
        }
    }

    private updateHitRate(): void {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    }

    private resetStats(): void {
        this.stats = {
            hits: 0,
            misses: 0,
            hitRate: 0,
            totalKeys: 0,
            memoryUsage: 0,
            evictions: 0
        };
    }

    public getConnectionStatus(): boolean {
        return this.isConnected;
    }
}
