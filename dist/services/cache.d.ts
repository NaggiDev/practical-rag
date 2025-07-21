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
export declare class CacheManager {
    private redis;
    private config;
    private stats;
    private isConnected;
    constructor(config: CacheConfig);
    private setupEventHandlers;
    connect(): Promise<void>;
    private configureRedis;
    disconnect(): Promise<void>;
    getCachedQueryResult(queryHash: string): Promise<QueryResult | null>;
    setCachedQueryResult(queryHash: string, result: QueryResult, customTtl?: number): Promise<void>;
    getCachedEmbedding(textHash: string): Promise<number[] | null>;
    setCachedEmbedding(textHash: string, embedding: number[], customTtl?: number): Promise<void>;
    getCachedEmbeddings(textHashes: string[]): Promise<Map<string, number[]>>;
    setCachedEmbeddings(embeddings: Map<string, number[]>, customTtl?: number): Promise<void>;
    getCachedProcessedContent(contentId: string): Promise<any | null>;
    setCachedProcessedContent(contentId: string, content: any, customTtl?: number): Promise<void>;
    invalidateQueryCache(pattern?: string): Promise<number>;
    invalidateEmbeddingCache(pattern?: string): Promise<number>;
    invalidateContentCache(contentId?: string): Promise<number>;
    getStats(): Promise<CacheStats>;
    clearAllCache(): Promise<void>;
    healthCheck(): Promise<boolean>;
    private getQueryResultKey;
    private getEmbeddingKey;
    private getProcessedContentKey;
    private updateAccessStats;
    private updateHitRate;
    private resetStats;
    getConnectionStatus(): boolean;
}
//# sourceMappingURL=cache.d.ts.map