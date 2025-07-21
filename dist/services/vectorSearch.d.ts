export interface VectorDatabaseConfig {
    provider: 'faiss' | 'qdrant' | 'pinecone';
    dimension: number;
    indexType?: string;
    connectionString?: string;
    apiKey?: string;
    environment?: string;
    indexName?: string;
    metricType?: 'l2' | 'ip' | 'cosine';
    nlist?: number;
    timeout?: number;
}
export interface VectorRecord {
    id: string;
    vector: number[];
    metadata: Record<string, any>;
}
export interface SearchResult {
    id: string;
    score: number;
    metadata: Record<string, any>;
}
export interface SearchOptions {
    topK: number;
    filter?: Record<string, any>;
    includeMetadata?: boolean;
    threshold?: number;
}
export interface IndexStats {
    totalVectors: number;
    dimension: number;
    indexType: string;
    memoryUsage?: number;
    lastUpdated: Date;
}
export interface HybridSearchOptions extends SearchOptions {
    keywordWeight?: number;
    vectorWeight?: number;
    keywordBoost?: Record<string, number>;
    rerankResults?: boolean;
}
export interface RankedSearchResult extends SearchResult {
    vectorScore: number;
    keywordScore?: number;
    finalScore: number;
    rankingFactors: {
        semantic: number;
        keyword?: number;
        metadata?: number;
        recency?: number;
    };
}
export declare class VectorSearchEngine {
    private vectorDb;
    private embeddingService;
    private isInitialized;
    constructor(vectorDb: VectorDatabase, embeddingService?: any);
    initialize(): Promise<void>;
    semanticSearch(query: string, options: SearchOptions): Promise<RankedSearchResult[]>;
    hybridSearch(query: string, options: HybridSearchOptions): Promise<RankedSearchResult[]>;
    private keywordSearch;
    private extractKeywords;
    private isStopWord;
    private calculateKeywordScore;
    private combineSearchResults;
    private applyRankingFactors;
    private calculateMetadataBoost;
    private calculateRecencyBoost;
    private rerankResults;
    private isDiverseResult;
    getSearchStats(): Promise<{
        totalVectors: number;
        averageResponseTime: number;
        cacheHitRate: number;
        lastOptimized: Date;
    }>;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: object;
    }>;
}
export declare class VectorDatabase {
    private config;
    private faissIndex?;
    private qdrantClient?;
    private pineconeClient?;
    private vectorStore;
    private isInitialized;
    constructor(config: VectorDatabaseConfig);
    initialize(): Promise<void>;
    private initializeFaiss;
    private initializeQdrant;
    private initializePinecone;
    storeVectors(vectors: VectorRecord[]): Promise<void>;
    private storeFaissVectors;
    private storeQdrantVectors;
    private storePineconeVectors;
    searchVectors(queryVector: number[], options: SearchOptions): Promise<SearchResult[]>;
    private searchFaissVectors;
    private searchQdrantVectors;
    private searchPineconeVectors;
    updateVectors(vectors: VectorRecord[]): Promise<void>;
    deleteVectors(ids: string[]): Promise<void>;
    private deleteFaissVectors;
    private deleteQdrantVectors;
    private deletePineconeVectors;
    optimizeIndex(): Promise<void>;
    private optimizeFaissIndex;
    private optimizeQdrantIndex;
    getIndexStats(): Promise<IndexStats>;
    private getFaissStats;
    private getQdrantStats;
    private getPineconeStats;
    healthCheck(): Promise<{
        status: 'healthy' | 'unhealthy';
        details: object;
    }>;
    getConfig(): VectorDatabaseConfig;
    close(): Promise<void>;
}
//# sourceMappingURL=vectorSearch.d.ts.map