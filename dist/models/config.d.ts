import { DataSourceConfig } from './dataSource';
export interface SystemConfig {
    server: ServerConfig;
    database: DatabaseConfig;
    cache: CacheConfig;
    embedding: EmbeddingConfig;
    search: SearchConfig;
    monitoring: MonitoringConfig;
    dataSources: DataSourceConfig[];
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
export declare class SystemConfigModel implements SystemConfig {
    readonly server: ServerConfig;
    readonly database: DatabaseConfig;
    readonly cache: CacheConfig;
    readonly embedding: EmbeddingConfig;
    readonly search: SearchConfig;
    readonly monitoring: MonitoringConfig;
    readonly dataSources: DataSourceConfig[];
    constructor(data: Partial<SystemConfig>);
    private sanitize;
    private sanitizeServerConfig;
    private sanitizeDatabaseConfig;
    private sanitizeCacheConfig;
    private sanitizeEmbeddingConfig;
    private sanitizeSearchConfig;
    private sanitizeMonitoringConfig;
    private validate;
    private getDefaultServerConfig;
    private getDefaultDatabaseConfig;
    private getDefaultCacheConfig;
    private getDefaultEmbeddingConfig;
    private getDefaultSearchConfig;
    private getDefaultMonitoringConfig;
    toJSON(): SystemConfig;
    static fromJSON(data: any): SystemConfigModel;
    static fromEnvironment(): SystemConfigModel;
    static loadFromFile(filePath: string): SystemConfigModel;
}
//# sourceMappingURL=config.d.ts.map