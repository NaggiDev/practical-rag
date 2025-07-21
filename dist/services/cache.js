"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheManager = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
class CacheManager {
    constructor(config) {
        this.isConnected = false;
        this.config = config;
        this.stats = {
            hits: 0,
            misses: 0,
            hitRate: 0,
            totalKeys: 0,
            memoryUsage: 0,
            evictions: 0
        };
        this.redis = new ioredis_1.default({
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
    setupEventHandlers() {
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
    async connect() {
        try {
            await this.redis.connect();
            await this.configureRedis();
        }
        catch (error) {
            throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async configureRedis() {
        try {
            await this.redis.config('SET', 'maxmemory', this.config.maxMemory);
            await this.redis.config('SET', 'maxmemory-policy', this.config.evictionPolicy);
            console.log(`Redis configured with maxmemory: ${this.config.maxMemory}, policy: ${this.config.evictionPolicy}`);
        }
        catch (error) {
            console.warn('Failed to configure Redis settings:', error);
        }
    }
    async disconnect() {
        if (this.redis) {
            await this.redis.quit();
            this.isConnected = false;
        }
    }
    async getCachedQueryResult(queryHash) {
        if (!this.isConnected)
            return null;
        try {
            const key = this.getQueryResultKey(queryHash);
            const cached = await this.redis.get(key);
            if (cached) {
                this.stats.hits++;
                await this.updateAccessStats(key);
                return JSON.parse(cached);
            }
            else {
                this.stats.misses++;
                return null;
            }
        }
        catch (error) {
            console.error('Error getting cached query result:', error);
            this.stats.misses++;
            return null;
        }
        finally {
            this.updateHitRate();
        }
    }
    async setCachedQueryResult(queryHash, result, customTtl) {
        if (!this.isConnected)
            return;
        try {
            const key = this.getQueryResultKey(queryHash);
            const ttl = customTtl || this.config.ttl.queryResults;
            const cacheEntry = {
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
        }
        catch (error) {
            console.error('Error setting cached query result:', error);
        }
    }
    async getCachedEmbedding(textHash) {
        if (!this.isConnected)
            return null;
        try {
            const key = this.getEmbeddingKey(textHash);
            const cached = await this.redis.get(key);
            if (cached) {
                this.stats.hits++;
                await this.updateAccessStats(key);
                return JSON.parse(cached);
            }
            else {
                this.stats.misses++;
                return null;
            }
        }
        catch (error) {
            console.error('Error getting cached embedding:', error);
            this.stats.misses++;
            return null;
        }
        finally {
            this.updateHitRate();
        }
    }
    async setCachedEmbedding(textHash, embedding, customTtl) {
        if (!this.isConnected)
            return;
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
        }
        catch (error) {
            console.error('Error setting cached embedding:', error);
        }
    }
    async getCachedEmbeddings(textHashes) {
        const results = new Map();
        if (!this.isConnected || textHashes.length === 0)
            return results;
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
                }
                else {
                    this.stats.misses++;
                }
            }
        }
        catch (error) {
            console.error('Error getting cached embeddings:', error);
        }
        finally {
            this.updateHitRate();
        }
        return results;
    }
    async setCachedEmbeddings(embeddings, customTtl) {
        if (!this.isConnected || embeddings.size === 0)
            return;
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
        }
        catch (error) {
            console.error('Error setting cached embeddings:', error);
        }
    }
    async getCachedProcessedContent(contentId) {
        if (!this.isConnected)
            return null;
        try {
            const key = this.getProcessedContentKey(contentId);
            const cached = await this.redis.get(key);
            if (cached) {
                this.stats.hits++;
                await this.updateAccessStats(key);
                return JSON.parse(cached);
            }
            else {
                this.stats.misses++;
                return null;
            }
        }
        catch (error) {
            console.error('Error getting cached processed content:', error);
            this.stats.misses++;
            return null;
        }
        finally {
            this.updateHitRate();
        }
    }
    async setCachedProcessedContent(contentId, content, customTtl) {
        if (!this.isConnected)
            return;
        try {
            const key = this.getProcessedContentKey(contentId);
            const ttl = customTtl || this.config.ttl.embeddings;
            await this.redis.setex(key, ttl, JSON.stringify(content));
            await this.redis.setex(`${key}:meta`, ttl, JSON.stringify({
                timestamp: Date.now(),
                ttl,
                accessCount: 0,
                lastAccessed: Date.now()
            }));
        }
        catch (error) {
            console.error('Error setting cached processed content:', error);
        }
    }
    async invalidateQueryCache(pattern) {
        if (!this.isConnected)
            return 0;
        try {
            const searchPattern = pattern || 'query:*';
            const keys = await this.redis.keys(searchPattern);
            if (keys.length > 0) {
                const deleted = await this.redis.del(...keys);
                console.log(`Invalidated ${deleted} query cache entries`);
                return deleted;
            }
            return 0;
        }
        catch (error) {
            console.error('Error invalidating query cache:', error);
            return 0;
        }
    }
    async invalidateEmbeddingCache(pattern) {
        if (!this.isConnected)
            return 0;
        try {
            const searchPattern = pattern || 'embedding:*';
            const keys = await this.redis.keys(searchPattern);
            if (keys.length > 0) {
                const deleted = await this.redis.del(...keys);
                console.log(`Invalidated ${deleted} embedding cache entries`);
                return deleted;
            }
            return 0;
        }
        catch (error) {
            console.error('Error invalidating embedding cache:', error);
            return 0;
        }
    }
    async invalidateContentCache(contentId) {
        if (!this.isConnected)
            return 0;
        try {
            const searchPattern = contentId ? `content:${contentId}*` : 'content:*';
            const keys = await this.redis.keys(searchPattern);
            if (keys.length > 0) {
                const deleted = await this.redis.del(...keys);
                console.log(`Invalidated ${deleted} content cache entries`);
                return deleted;
            }
            return 0;
        }
        catch (error) {
            console.error('Error invalidating content cache:', error);
            return 0;
        }
    }
    async getStats() {
        if (!this.isConnected)
            return this.stats;
        try {
            const info = await this.redis.info('memory');
            const memoryMatch = info.match(/used_memory:(\d+)/);
            const evictionsMatch = info.match(/evicted_keys:(\d+)/);
            this.stats.memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;
            this.stats.evictions = evictionsMatch ? parseInt(evictionsMatch[1]) : 0;
            this.stats.totalKeys = await this.redis.dbsize();
            return { ...this.stats };
        }
        catch (error) {
            console.error('Error getting cache stats:', error);
            return this.stats;
        }
    }
    async clearAllCache() {
        if (!this.isConnected)
            return;
        try {
            await this.redis.flushdb();
            this.resetStats();
            console.log('All cache cleared');
        }
        catch (error) {
            console.error('Error clearing cache:', error);
        }
    }
    async healthCheck() {
        try {
            const result = await this.redis.ping();
            return result === 'PONG';
        }
        catch (error) {
            console.error('Cache health check failed:', error);
            return false;
        }
    }
    getQueryResultKey(queryHash) {
        return `query:${queryHash}`;
    }
    getEmbeddingKey(textHash) {
        return `embedding:${textHash}`;
    }
    getProcessedContentKey(contentId) {
        return `content:${contentId}`;
    }
    async updateAccessStats(key) {
        try {
            const metaKey = `${key}:meta`;
            const meta = await this.redis.get(metaKey);
            if (meta) {
                const metaData = JSON.parse(meta);
                metaData.accessCount++;
                metaData.lastAccessed = Date.now();
                await this.redis.setex(metaKey, metaData.ttl, JSON.stringify(metaData));
            }
        }
        catch (error) {
        }
    }
    updateHitRate() {
        const total = this.stats.hits + this.stats.misses;
        this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
    }
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            hitRate: 0,
            totalKeys: 0,
            memoryUsage: 0,
            evictions: 0
        };
    }
    getConnectionStatus() {
        return this.isConnected;
    }
}
exports.CacheManager = CacheManager;
//# sourceMappingURL=cache.js.map