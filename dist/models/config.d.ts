export interface SystemConfig {
    server: ServerConfig;
    database: DatabaseConfig;
    cache: CacheConfig;
    embedding: EmbeddingConfig;
    search: SearchConfig;
    monitoring: MonitoringConfig;
    dataSources: import('./dataSource').DataSourceConfig[];
}
export interface ServerConfig {
    port: number;
    host: string;
    cors: {
        enabled: boolean;
        origins: string[];
    };
    rateLimit: {
        windowMs: number;
        maxRequests: number;
    };
    timeout: number;
}
export interface DatabaseConfig {
    vector: {
        provider: 'faiss' | 'pinecone' | 'weaviate' | 'qdrant';
        connectionString?: string;
        apiKey?: string;
        indexName: string;
        dimension: number;
    };
    metadata: {
        provider: 'postgresql' | 'mongodb' | 'sqlite';
        connectionString: string;
    };
}
export interface CacheConfig {
    redis: {
        host: string;
        port: number;
        password?: string;
        db: number;
    };
    ttl: {
        queryResults: number;
        embeddings: number;
        healthChecks: number;
    };
    maxMemory: string;
    evictionPolicy: 'allkeys-lru' | 'volatile-lru' | 'allkeys-lfu';
}
export interface EmbeddingConfig {
    provider: 'openai' | 'huggingface' | 'sentence-transformers' | 'local';
    model: string;
    apiKey?: string;
    dimension: number;
    batchSize: number;
    timeout: number;
}
export interface SearchConfig {
    defaultTopK: number;
    maxTopK: number;
    similarityThreshold: number;
    hybridSearch: {
        enabled: boolean;
        vectorWeight: number;
        keywordWeight: number;
    };
    reranking: {
        enabled: boolean;
        model?: string;
    };
}
export interface MonitoringConfig {
    metrics: {
        enabled: boolean;
        port: number;
        path: string;
    };
    logging: {
        level: 'debug' | 'info' | 'warn' | 'error';
        format: 'json' | 'text';
        file?: string;
    };
    healthCheck: {
        interval: number;
        timeout: number;
    };
}
//# sourceMappingURL=config.d.ts.map