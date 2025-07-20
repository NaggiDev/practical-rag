import { CacheManager } from './cache';

export interface QueryPattern {
    pattern: string;
    frequency: number;
    lastUsed: Date;
    avgResponseTime: number;
    priority: number;
}

export interface UsageStats {
    queryHash: string;
    count: number;
    lastAccessed: Date;
    avgProcessingTime: number;
    sources: string[];
}

export interface CacheWarmingConfig {
    enabled: boolean;
    maxWarmingQueries: number;
    warmingInterval: number; // in milliseconds
    popularityThreshold: number;
    maxAge: number; // in milliseconds
    preloadBatchSize: number;
}

export class CacheWarmingService {
    private cacheManager: CacheManager;
    private config: CacheWarmingConfig;
    private usageStats: Map<string, UsageStats> = new Map();
    private queryPatterns: Map<string, QueryPattern> = new Map();
    private warmingTimer: NodeJS.Timeout | null = null;
    private isWarming: boolean = false;

    constructor(cacheManager: CacheManager, config: CacheWarmingConfig) {
        this.cacheManager = cacheManager;
        this.config = config;
    }

    public start(): void {
        if (!this.config.enabled || this.warmingTimer) {
            return;
        }

        console.log('Starting cache warming service...');
        this.warmingTimer = setInterval(
            () => this.performCacheWarming(),
            this.config.warmingInterval
        );
    }

    public stop(): void {
        if (this.warmingTimer) {
            clearInterval(this.warmingTimer);
            this.warmingTimer = null;
            console.log('Cache warming service stopped');
        }
    }

    // Track query usage for warming decisions
    public trackQueryUsage(queryHash: string, processingTime: number, sources: string[]): void {
        const existing = this.usageStats.get(queryHash);
        const now = new Date();

        if (existing) {
            existing.count++;
            existing.lastAccessed = now;
            existing.avgProcessingTime = (existing.avgProcessingTime + processingTime) / 2;
            existing.sources = [...new Set([...existing.sources, ...sources])];
        } else {
            this.usageStats.set(queryHash, {
                queryHash,
                count: 1,
                lastAccessed: now,
                avgProcessingTime: processingTime,
                sources
            });
        }

        // Update query patterns
        this.updateQueryPatterns(queryHash);
    }

    // Get popular queries that should be warmed
    public getPopularQueries(limit: number = this.config.maxWarmingQueries): string[] {
        const now = Date.now();
        const maxAge = this.config.maxAge;

        return Array.from(this.usageStats.entries())
            .filter(([_, stats]) => {
                const age = now - stats.lastAccessed.getTime();
                return age < maxAge && stats.count >= this.config.popularityThreshold;
            })
            .sort((a, b) => {
                // Sort by frequency and recency
                const scoreA = a[1].count * (1 / (now - a[1].lastAccessed.getTime() + 1));
                const scoreB = b[1].count * (1 / (now - b[1].lastAccessed.getTime() + 1));
                return scoreB - scoreA;
            })
            .slice(0, limit)
            .map(([queryHash]) => queryHash);
    }

    // Preload hot data based on usage patterns
    public async preloadHotData(): Promise<void> {
        if (this.isWarming) {
            return;
        }

        this.isWarming = true;
        try {
            const popularQueries = this.getPopularQueries();
            console.log(`Preloading ${popularQueries.length} popular queries`);

            // Process in batches to avoid overwhelming the system
            for (let i = 0; i < popularQueries.length; i += this.config.preloadBatchSize) {
                const batch = popularQueries.slice(i, i + this.config.preloadBatchSize);
                await this.preloadQueryBatch(batch);

                // Small delay between batches
                await this.delay(100);
            }

            console.log('Hot data preloading completed');
        } catch (error) {
            console.error('Error during hot data preloading:', error);
        } finally {
            this.isWarming = false;
        }
    }

    // Cache invalidation logic for data source updates
    public async invalidateForDataSourceUpdate(sourceId: string): Promise<void> {
        console.log(`Invalidating cache for data source update: ${sourceId}`);

        try {
            // Find all queries that used this data source
            const affectedQueries = Array.from(this.usageStats.entries())
                .filter(([_, stats]) => stats.sources.includes(sourceId))
                .map(([queryHash]) => queryHash);

            console.log(`Found ${affectedQueries.length} queries affected by source ${sourceId}`);

            // Invalidate affected query results
            for (const queryHash of affectedQueries) {
                await this.cacheManager.invalidateQueryCache(`query:${queryHash}*`);
            }

            // Invalidate processed content cache for this source
            await this.cacheManager.invalidateContentCache(sourceId);

            // Remove usage stats for invalidated queries to prevent re-warming stale data
            affectedQueries.forEach(queryHash => {
                this.usageStats.delete(queryHash);
            });

            console.log(`Cache invalidation completed for source ${sourceId}`);
        } catch (error) {
            console.error(`Error invalidating cache for source ${sourceId}:`, error);
        }
    }

    // Intelligent cache warming based on patterns
    public async performCacheWarming(): Promise<void> {
        if (this.isWarming || !this.config.enabled) {
            return;
        }

        console.log('Performing intelligent cache warming...');

        try {
            // Clean up old usage stats
            this.cleanupOldStats();

            // Preload hot data
            await this.preloadHotData();

            // Warm cache based on query patterns
            await this.warmByPatterns();

        } catch (error) {
            console.error('Error during cache warming:', error);
        }
    }

    // Get cache warming statistics
    public getWarmingStats(): {
        totalTrackedQueries: number;
        popularQueries: number;
        isWarming: boolean;
        lastWarmingTime: Date | null;
        topPatterns: QueryPattern[];
    } {
        const popularQueries = this.getPopularQueries();
        const topPatterns = Array.from(this.queryPatterns.values())
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 10);

        return {
            totalTrackedQueries: this.usageStats.size,
            popularQueries: popularQueries.length,
            isWarming: this.isWarming,
            lastWarmingTime: null, // Could be tracked if needed
            topPatterns
        };
    }

    // Private helper methods
    private updateQueryPatterns(queryHash: string): void {
        // Extract patterns from query hash (simplified pattern recognition)
        const pattern = this.extractPattern(queryHash);
        const existing = this.queryPatterns.get(pattern);
        const now = new Date();

        if (existing) {
            existing.frequency++;
            existing.lastUsed = now;
            existing.priority = this.calculatePriority(existing);
        } else {
            this.queryPatterns.set(pattern, {
                pattern,
                frequency: 1,
                lastUsed: now,
                avgResponseTime: 0,
                priority: 1
            });
        }
    }

    private extractPattern(queryHash: string): string {
        // Simplified pattern extraction - in a real implementation,
        // this would analyze the actual query text for semantic patterns
        return queryHash.substring(0, 8); // Use first 8 chars as pattern
    }

    private calculatePriority(pattern: QueryPattern): number {
        const recencyFactor = Math.max(0, 1 - (Date.now() - pattern.lastUsed.getTime()) / this.config.maxAge);
        const frequencyFactor = Math.min(1, pattern.frequency / 100);
        return recencyFactor * 0.6 + frequencyFactor * 0.4;
    }

    private async preloadQueryBatch(queryHashes: string[]): Promise<void> {
        const promises = queryHashes.map(async (queryHash) => {
            try {
                // Check if already cached
                const cached = await this.cacheManager.getCachedQueryResult(queryHash);
                if (!cached) {
                    // In a real implementation, this would trigger query execution
                    // For now, we'll just log that we would warm this query
                    console.log(`Would warm query: ${queryHash}`);
                }
            } catch (error) {
                console.error(`Error preloading query ${queryHash}:`, error);
            }
        });

        await Promise.allSettled(promises);
    }

    private async warmByPatterns(): Promise<void> {
        const topPatterns = Array.from(this.queryPatterns.values())
            .filter(p => p.priority > 0.5)
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 5);

        console.log(`Warming cache for ${topPatterns.length} high-priority patterns`);

        for (const pattern of topPatterns) {
            // Find queries matching this pattern
            const matchingQueries = Array.from(this.usageStats.keys())
                .filter(queryHash => queryHash.startsWith(pattern.pattern))
                .slice(0, 3); // Limit per pattern

            await this.preloadQueryBatch(matchingQueries);
        }
    }

    private cleanupOldStats(): void {
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

        // Clean up old patterns
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

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    public isEnabled(): boolean {
        return this.config.enabled;
    }

    public getConfig(): CacheWarmingConfig {
        return { ...this.config };
    }

    public updateConfig(updates: Partial<CacheWarmingConfig>): void {
        this.config = { ...this.config, ...updates };

        if (!this.config.enabled && this.warmingTimer) {
            this.stop();
        } else if (this.config.enabled && !this.warmingTimer) {
            this.start();
        }
    }
}