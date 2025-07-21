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
    warmingInterval: number;
    popularityThreshold: number;
    maxAge: number;
    preloadBatchSize: number;
}
export declare class CacheWarmingService {
    private cacheManager;
    private config;
    private usageStats;
    private queryPatterns;
    private warmingTimer;
    private isWarming;
    constructor(cacheManager: CacheManager, config: CacheWarmingConfig);
    start(): void;
    stop(): void;
    trackQueryUsage(queryHash: string, processingTime: number, sources: string[]): void;
    getPopularQueries(limit?: number): string[];
    preloadHotData(): Promise<void>;
    invalidateForDataSourceUpdate(sourceId: string): Promise<void>;
    performCacheWarming(): Promise<void>;
    getWarmingStats(): {
        totalTrackedQueries: number;
        popularQueries: number;
        isWarming: boolean;
        lastWarmingTime: Date | null;
        topPatterns: QueryPattern[];
    };
    private updateQueryPatterns;
    private extractPattern;
    private calculatePriority;
    private preloadQueryBatch;
    private warmByPatterns;
    private cleanupOldStats;
    private delay;
    isEnabled(): boolean;
    getConfig(): CacheWarmingConfig;
    updateConfig(updates: Partial<CacheWarmingConfig>): void;
}
//# sourceMappingURL=cacheWarming.d.ts.map