"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheWarmingService = void 0;
class CacheWarmingService {
    constructor(cacheManager, config) {
        this.usageStats = new Map();
        this.queryPatterns = new Map();
        this.warmingTimer = null;
        this.isWarming = false;
        this.cacheManager = cacheManager;
        this.config = config;
    }
    start() {
        if (!this.config.enabled || this.warmingTimer) {
            return;
        }
        console.log('Starting cache warming service...');
        this.warmingTimer = setInterval(() => this.performCacheWarming(), this.config.warmingInterval);
    }
    stop() {
        if (this.warmingTimer) {
            clearInterval(this.warmingTimer);
            this.warmingTimer = null;
            console.log('Cache warming service stopped');
        }
    }
    trackQueryUsage(queryHash, processingTime, sources) {
        const existing = this.usageStats.get(queryHash);
        const now = new Date();
        if (existing) {
            existing.count++;
            existing.lastAccessed = now;
            existing.avgProcessingTime = (existing.avgProcessingTime + processingTime) / 2;
            existing.sources = [...new Set([...existing.sources, ...sources])];
        }
        else {
            this.usageStats.set(queryHash, {
                queryHash,
                count: 1,
                lastAccessed: now,
                avgProcessingTime: processingTime,
                sources
            });
        }
        this.updateQueryPatterns(queryHash);
    }
    getPopularQueries(limit = this.config.maxWarmingQueries) {
        const now = Date.now();
        const maxAge = this.config.maxAge;
        return Array.from(this.usageStats.entries())
            .filter(([_, stats]) => {
            const age = now - stats.lastAccessed.getTime();
            return age < maxAge && stats.count >= this.config.popularityThreshold;
        })
            .sort((a, b) => {
            const scoreA = a[1].count * (1 / (now - a[1].lastAccessed.getTime() + 1));
            const scoreB = b[1].count * (1 / (now - b[1].lastAccessed.getTime() + 1));
            return scoreB - scoreA;
        })
            .slice(0, limit)
            .map(([queryHash]) => queryHash);
    }
    async preloadHotData() {
        if (this.isWarming) {
            return;
        }
        this.isWarming = true;
        try {
            const popularQueries = this.getPopularQueries();
            console.log(`Preloading ${popularQueries.length} popular queries`);
            for (let i = 0; i < popularQueries.length; i += this.config.preloadBatchSize) {
                const batch = popularQueries.slice(i, i + this.config.preloadBatchSize);
                await this.preloadQueryBatch(batch);
                await this.delay(100);
            }
            console.log('Hot data preloading completed');
        }
        catch (error) {
            console.error('Error during hot data preloading:', error);
        }
        finally {
            this.isWarming = false;
        }
    }
    async invalidateForDataSourceUpdate(sourceId) {
        console.log(`Invalidating cache for data source update: ${sourceId}`);
        try {
            const affectedQueries = Array.from(this.usageStats.entries())
                .filter(([_, stats]) => stats.sources.includes(sourceId))
                .map(([queryHash]) => queryHash);
            console.log(`Found ${affectedQueries.length} queries affected by source ${sourceId}`);
            for (const queryHash of affectedQueries) {
                await this.cacheManager.invalidateQueryCache(`query:${queryHash}*`);
            }
            await this.cacheManager.invalidateContentCache(sourceId);
            affectedQueries.forEach(queryHash => {
                this.usageStats.delete(queryHash);
            });
            console.log(`Cache invalidation completed for source ${sourceId}`);
        }
        catch (error) {
            console.error(`Error invalidating cache for source ${sourceId}:`, error);
        }
    }
    async performCacheWarming() {
        if (this.isWarming || !this.config.enabled) {
            return;
        }
        console.log('Performing intelligent cache warming...');
        try {
            this.cleanupOldStats();
            await this.preloadHotData();
            await this.warmByPatterns();
        }
        catch (error) {
            console.error('Error during cache warming:', error);
        }
    }
    getWarmingStats() {
        const popularQueries = this.getPopularQueries();
        const topPatterns = Array.from(this.queryPatterns.values())
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 10);
        return {
            totalTrackedQueries: this.usageStats.size,
            popularQueries: popularQueries.length,
            isWarming: this.isWarming,
            lastWarmingTime: null,
            topPatterns
        };
    }
    updateQueryPatterns(queryHash) {
        const pattern = this.extractPattern(queryHash);
        const existing = this.queryPatterns.get(pattern);
        const now = new Date();
        if (existing) {
            existing.frequency++;
            existing.lastUsed = now;
            existing.priority = this.calculatePriority(existing);
        }
        else {
            this.queryPatterns.set(pattern, {
                pattern,
                frequency: 1,
                lastUsed: now,
                avgResponseTime: 0,
                priority: 1
            });
        }
    }
    extractPattern(queryHash) {
        return queryHash.substring(0, 8);
    }
    calculatePriority(pattern) {
        const recencyFactor = Math.max(0, 1 - (Date.now() - pattern.lastUsed.getTime()) / this.config.maxAge);
        const frequencyFactor = Math.min(1, pattern.frequency / 100);
        return recencyFactor * 0.6 + frequencyFactor * 0.4;
    }
    async preloadQueryBatch(queryHashes) {
        const promises = queryHashes.map(async (queryHash) => {
            try {
                const cached = await this.cacheManager.getCachedQueryResult(queryHash);
                if (!cached) {
                    console.log(`Would warm query: ${queryHash}`);
                }
            }
            catch (error) {
                console.error(`Error preloading query ${queryHash}:`, error);
            }
        });
        await Promise.allSettled(promises);
    }
    async warmByPatterns() {
        const topPatterns = Array.from(this.queryPatterns.values())
            .filter(p => p.priority > 0.5)
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 5);
        console.log(`Warming cache for ${topPatterns.length} high-priority patterns`);
        for (const pattern of topPatterns) {
            const matchingQueries = Array.from(this.usageStats.keys())
                .filter(queryHash => queryHash.startsWith(pattern.pattern))
                .slice(0, 3);
            await this.preloadQueryBatch(matchingQueries);
        }
    }
    cleanupOldStats() {
        const now = Date.now();
        const maxAge = this.config.maxAge;
        let cleaned = 0;
        for (const [queryHash, stats] of this.usageStats.entries()) {
            const age = now - stats.lastAccessed.getTime();
            if (age > maxAge) {
                this.usageStats.delete(queryHash);
                cleaned++;
            }
        }
        for (const [pattern, patternStats] of this.queryPatterns.entries()) {
            const age = now - patternStats.lastUsed.getTime();
            if (age > maxAge) {
                this.queryPatterns.delete(pattern);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            console.log(`Cleaned up ${cleaned} old cache warming entries`);
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    isEnabled() {
        return this.config.enabled;
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
        if (!this.config.enabled && this.warmingTimer) {
            this.stop();
        }
        else if (this.config.enabled && !this.warmingTimer) {
            this.start();
        }
    }
}
exports.CacheWarmingService = CacheWarmingService;
//# sourceMappingURL=cacheWarming.js.map