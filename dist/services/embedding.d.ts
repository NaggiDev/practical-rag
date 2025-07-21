import Redis from 'ioredis';
export interface EmbeddingConfig {
    provider: 'huggingface' | 'openai' | 'local';
    model: string;
    apiKey?: string;
    maxTokens?: number;
    batchSize?: number;
    timeout?: number;
    cacheEnabled?: boolean;
    cacheTTL?: number;
}
export interface EmbeddingResult {
    text: string;
    embedding: number[];
    model: string;
    timestamp: Date;
    cached: boolean;
}
export interface BatchEmbeddingResult {
    results: EmbeddingResult[];
    totalProcessed: number;
    processingTime: number;
    cacheHits: number;
}
export declare class EmbeddingService {
    private config;
    private hfClient?;
    private openaiClient?;
    private localPipeline?;
    private redis?;
    private isInitialized;
    constructor(config: EmbeddingConfig, redis?: Redis);
    initialize(): Promise<void>;
    generateEmbedding(text: string): Promise<EmbeddingResult>;
    batchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult>;
    private processBatch;
    private computeEmbedding;
    private computeBatchEmbeddings;
    private truncateText;
    private getCacheKey;
    private hashString;
    private getCachedEmbedding;
    private cacheEmbedding;
    clearCache(): Promise<void>;
    getConfig(): EmbeddingConfig;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: object;
    }>;
}
//# sourceMappingURL=embedding.d.ts.map