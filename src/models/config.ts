import * as dotenv from 'dotenv';
import Joi from 'joi';
import { DataSourceConfig } from './dataSource';

// Load environment variables
dotenv.config();

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

// Validation schemas
const serverConfigSchema = Joi.object({
    port: Joi.number().integer().min(1).max(65535).required(),
    host: Joi.string().required().min(1).max(255),
    cors: Joi.object({
        enabled: Joi.boolean().required(),
        origins: Joi.array().items(Joi.alternatives().try(
            Joi.string().uri(),
            Joi.string().valid('*')
        )).required()
    }).required(),
    rateLimit: Joi.object({
        windowMs: Joi.number().integer().min(1000).max(3600000).required(), // 1 second to 1 hour
        maxRequests: Joi.number().integer().min(1).max(10000).required()
    }).required(),
    timeout: Joi.number().integer().min(1000).max(300000).required() // 1 second to 5 minutes
});

const databaseConfigSchema = Joi.object({
    vector: Joi.object({
        provider: Joi.string().valid('faiss', 'pinecone', 'weaviate', 'qdrant').required(),
        connectionString: Joi.string().optional().min(1).max(1000),
        apiKey: Joi.string().optional().min(1).max(500),
        indexName: Joi.string().required().min(1).max(100),
        dimension: Joi.number().integer().min(1).max(10000).required()
    }).required(),
    metadata: Joi.object({
        provider: Joi.string().valid('postgresql', 'mongodb', 'sqlite').required(),
        connectionString: Joi.string().required().min(1).max(1000)
    }).required()
});

const cacheConfigSchema = Joi.object({
    redis: Joi.object({
        host: Joi.string().required().min(1).max(255),
        port: Joi.number().integer().min(1).max(65535).required(),
        password: Joi.string().optional().min(1).max(500),
        db: Joi.number().integer().min(0).max(15).required()
    }).required(),
    ttl: Joi.object({
        queryResults: Joi.number().integer().min(60).max(86400).required(), // 1 minute to 24 hours
        embeddings: Joi.number().integer().min(300).max(604800).required(), // 5 minutes to 7 days
        healthChecks: Joi.number().integer().min(30).max(3600).required() // 30 seconds to 1 hour
    }).required(),
    maxMemory: Joi.string().required().pattern(/^\d+[kmg]b$/i),
    evictionPolicy: Joi.string().valid('allkeys-lru', 'volatile-lru', 'allkeys-lfu').required()
});

const embeddingConfigSchema = Joi.object({
    provider: Joi.string().valid('openai', 'huggingface', 'sentence-transformers', 'local').required(),
    model: Joi.string().required().min(1).max(200),
    apiKey: Joi.string().optional().min(1).max(500),
    dimension: Joi.number().integer().min(1).max(10000).required(),
    batchSize: Joi.number().integer().min(1).max(1000).required(),
    timeout: Joi.number().integer().min(1000).max(300000).required()
});

const searchConfigSchema = Joi.object({
    defaultTopK: Joi.number().integer().min(1).max(1000).required(),
    maxTopK: Joi.number().integer().min(1).max(1000).required(),
    similarityThreshold: Joi.number().min(0).max(1).required(),
    hybridSearch: Joi.object({
        enabled: Joi.boolean().required(),
        vectorWeight: Joi.number().min(0).max(1).required(),
        keywordWeight: Joi.number().min(0).max(1).required()
    }).required(),
    reranking: Joi.object({
        enabled: Joi.boolean().required(),
        model: Joi.string().optional().min(1).max(200)
    }).required()
});

const monitoringConfigSchema = Joi.object({
    metrics: Joi.object({
        enabled: Joi.boolean().required(),
        port: Joi.number().integer().min(1).max(65535).required(),
        path: Joi.string().required().min(1).max(100)
    }).required(),
    logging: Joi.object({
        level: Joi.string().valid('debug', 'info', 'warn', 'error').required(),
        format: Joi.string().valid('json', 'text').required(),
        file: Joi.string().optional().min(1).max(500)
    }).required(),
    healthCheck: Joi.object({
        interval: Joi.number().integer().min(1000).max(300000).required(),
        timeout: Joi.number().integer().min(1000).max(60000).required()
    }).required()
});

const systemConfigSchema = Joi.object({
    server: serverConfigSchema.required(),
    database: databaseConfigSchema.required(),
    cache: cacheConfigSchema.required(),
    embedding: embeddingConfigSchema.required(),
    search: searchConfigSchema.required(),
    monitoring: monitoringConfigSchema.required(),
    dataSources: Joi.array().items(Joi.object()).required()
});

// Configuration classes with validation
export class SystemConfigModel implements SystemConfig {
    public readonly server: ServerConfig;
    public readonly database: DatabaseConfig;
    public readonly cache: CacheConfig;
    public readonly embedding: EmbeddingConfig;
    public readonly search: SearchConfig;
    public readonly monitoring: MonitoringConfig;
    public readonly dataSources: DataSourceConfig[];

    constructor(data: Partial<SystemConfig>) {
        const sanitizedData = this.sanitize(data);
        const validatedData = this.validate(sanitizedData);

        this.server = validatedData.server;
        this.database = validatedData.database;
        this.cache = validatedData.cache;
        this.embedding = validatedData.embedding;
        this.search = validatedData.search;
        this.monitoring = validatedData.monitoring;
        this.dataSources = validatedData.dataSources;
    }

    private sanitize(data: Partial<SystemConfig>): SystemConfig {
        return {
            server: this.sanitizeServerConfig(data.server),
            database: this.sanitizeDatabaseConfig(data.database),
            cache: this.sanitizeCacheConfig(data.cache),
            embedding: this.sanitizeEmbeddingConfig(data.embedding),
            search: this.sanitizeSearchConfig(data.search),
            monitoring: this.sanitizeMonitoringConfig(data.monitoring),
            dataSources: data.dataSources || []
        };
    }

    private sanitizeServerConfig(config?: Partial<ServerConfig>): ServerConfig {
        if (!config) return this.getDefaultServerConfig();

        return {
            port: typeof config.port === 'number' ? Math.floor(config.port) : 3000,
            host: typeof config.host === 'string' ? config.host.trim() : '0.0.0.0',
            cors: {
                enabled: Boolean(config.cors?.enabled ?? true),
                origins: Array.isArray(config.cors?.origins) ? config.cors.origins : ['*']
            },
            rateLimit: {
                windowMs: typeof config.rateLimit?.windowMs === 'number' ? Math.max(1000, Math.min(3600000, config.rateLimit.windowMs)) : 60000,
                maxRequests: typeof config.rateLimit?.maxRequests === 'number' ? Math.max(1, Math.min(10000, config.rateLimit.maxRequests)) : 100
            },
            timeout: typeof config.timeout === 'number' ? Math.max(1000, Math.min(300000, config.timeout)) : 30000
        };
    }

    private sanitizeDatabaseConfig(config?: Partial<DatabaseConfig>): DatabaseConfig {
        if (!config) return this.getDefaultDatabaseConfig();

        return {
            vector: {
                provider: config.vector?.provider || 'faiss',
                connectionString: typeof config.vector?.connectionString === 'string' ? config.vector.connectionString.trim() : undefined,
                apiKey: typeof config.vector?.apiKey === 'string' ? config.vector.apiKey.trim() : undefined,
                indexName: typeof config.vector?.indexName === 'string' ? config.vector.indexName.trim() : 'default-index',
                dimension: typeof config.vector?.dimension === 'number' ? Math.max(1, Math.min(10000, Math.floor(config.vector.dimension))) : 384
            },
            metadata: {
                provider: config.metadata?.provider || 'sqlite',
                connectionString: typeof config.metadata?.connectionString === 'string' ? config.metadata.connectionString.trim() : 'sqlite:./data/metadata.db'
            }
        };
    }

    private sanitizeCacheConfig(config?: Partial<CacheConfig>): CacheConfig {
        if (!config) return this.getDefaultCacheConfig();

        return {
            redis: {
                host: typeof config.redis?.host === 'string' ? config.redis.host.trim() : 'localhost',
                port: typeof config.redis?.port === 'number' ? Math.max(1, Math.min(65535, Math.floor(config.redis.port))) : 6379,
                password: typeof config.redis?.password === 'string' ? config.redis.password.trim() : undefined,
                db: typeof config.redis?.db === 'number' ? Math.max(0, Math.min(15, Math.floor(config.redis.db))) : 0
            },
            ttl: {
                queryResults: typeof config.ttl?.queryResults === 'number' ? Math.max(60, Math.min(86400, config.ttl.queryResults)) : 3600,
                embeddings: typeof config.ttl?.embeddings === 'number' ? Math.max(300, Math.min(604800, config.ttl.embeddings)) : 86400,
                healthChecks: typeof config.ttl?.healthChecks === 'number' ? Math.max(30, Math.min(3600, config.ttl.healthChecks)) : 300
            },
            maxMemory: typeof config.maxMemory === 'string' ? config.maxMemory : '256mb',
            evictionPolicy: config.evictionPolicy || 'allkeys-lru'
        };
    }

    private sanitizeEmbeddingConfig(config?: Partial<EmbeddingConfig>): EmbeddingConfig {
        if (!config) return this.getDefaultEmbeddingConfig();

        return {
            provider: config.provider || 'sentence-transformers',
            model: typeof config.model === 'string' ? config.model.trim() : 'all-MiniLM-L6-v2',
            apiKey: typeof config.apiKey === 'string' ? config.apiKey.trim() : undefined,
            dimension: typeof config.dimension === 'number' ? Math.max(1, Math.min(10000, Math.floor(config.dimension))) : 384,
            batchSize: typeof config.batchSize === 'number' ? Math.max(1, Math.min(1000, Math.floor(config.batchSize))) : 32,
            timeout: typeof config.timeout === 'number' ? Math.max(1000, Math.min(300000, config.timeout)) : 30000
        };
    }

    private sanitizeSearchConfig(config?: Partial<SearchConfig>): SearchConfig {
        if (!config) return this.getDefaultSearchConfig();

        return {
            defaultTopK: typeof config.defaultTopK === 'number' ? Math.max(1, Math.min(1000, Math.floor(config.defaultTopK))) : 10,
            maxTopK: typeof config.maxTopK === 'number' ? Math.max(1, Math.min(1000, Math.floor(config.maxTopK))) : 100,
            similarityThreshold: typeof config.similarityThreshold === 'number' ? Math.max(0, Math.min(1, config.similarityThreshold)) : 0.7,
            hybridSearch: {
                enabled: Boolean(config.hybridSearch?.enabled ?? false),
                vectorWeight: typeof config.hybridSearch?.vectorWeight === 'number' ? Math.max(0, Math.min(1, config.hybridSearch.vectorWeight)) : 0.7,
                keywordWeight: typeof config.hybridSearch?.keywordWeight === 'number' ? Math.max(0, Math.min(1, config.hybridSearch.keywordWeight)) : 0.3
            },
            reranking: {
                enabled: Boolean(config.reranking?.enabled ?? false),
                model: typeof config.reranking?.model === 'string' ? config.reranking.model.trim() : undefined
            }
        };
    }

    private sanitizeMonitoringConfig(config?: Partial<MonitoringConfig>): MonitoringConfig {
        if (!config) return this.getDefaultMonitoringConfig();

        return {
            metrics: {
                enabled: Boolean(config.metrics?.enabled ?? true),
                port: typeof config.metrics?.port === 'number' ? Math.max(1, Math.min(65535, Math.floor(config.metrics.port))) : 9090,
                path: typeof config.metrics?.path === 'string' ? config.metrics.path.trim() : '/metrics'
            },
            logging: {
                level: config.logging?.level || 'info',
                format: config.logging?.format || 'json',
                file: typeof config.logging?.file === 'string' ? config.logging.file.trim() : undefined
            },
            healthCheck: {
                interval: typeof config.healthCheck?.interval === 'number' ? Math.max(1000, Math.min(300000, config.healthCheck.interval)) : 30000,
                timeout: typeof config.healthCheck?.timeout === 'number' ? Math.max(1000, Math.min(60000, config.healthCheck.timeout)) : 5000
            }
        };
    }

    private validate(data: SystemConfig): SystemConfig {
        const { error, value } = systemConfigSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`SystemConfig validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value as SystemConfig;
    }

    // Default configurations
    private getDefaultServerConfig(): ServerConfig {
        return {
            port: parseInt(process.env.PORT || '3000'),
            host: process.env.HOST || '0.0.0.0',
            cors: {
                enabled: process.env.CORS_ENABLED !== 'false',
                origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
            },
            rateLimit: {
                windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
                maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100')
            },
            timeout: parseInt(process.env.SERVER_TIMEOUT || '30000')
        };
    }

    private getDefaultDatabaseConfig(): DatabaseConfig {
        return {
            vector: {
                provider: (process.env.VECTOR_DB_PROVIDER as any) || 'faiss',
                connectionString: process.env.VECTOR_DB_CONNECTION_STRING,
                apiKey: process.env.VECTOR_DB_API_KEY,
                indexName: process.env.VECTOR_DB_INDEX_NAME || 'default-index',
                dimension: parseInt(process.env.VECTOR_DB_DIMENSION || '384')
            },
            metadata: {
                provider: (process.env.METADATA_DB_PROVIDER as any) || 'sqlite',
                connectionString: process.env.METADATA_DB_CONNECTION_STRING || 'sqlite:./data/metadata.db'
            }
        };
    }

    private getDefaultCacheConfig(): CacheConfig {
        return {
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || '0')
            },
            ttl: {
                queryResults: parseInt(process.env.CACHE_TTL_QUERY_RESULTS || '3600'),
                embeddings: parseInt(process.env.CACHE_TTL_EMBEDDINGS || '86400'),
                healthChecks: parseInt(process.env.CACHE_TTL_HEALTH_CHECKS || '300')
            },
            maxMemory: process.env.REDIS_MAX_MEMORY || '256mb',
            evictionPolicy: (process.env.REDIS_EVICTION_POLICY as any) || 'allkeys-lru'
        };
    }

    private getDefaultEmbeddingConfig(): EmbeddingConfig {
        return {
            provider: (process.env.EMBEDDING_PROVIDER as any) || 'sentence-transformers',
            model: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
            apiKey: process.env.EMBEDDING_API_KEY,
            dimension: parseInt(process.env.EMBEDDING_DIMENSION || '384'),
            batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '32'),
            timeout: parseInt(process.env.EMBEDDING_TIMEOUT || '30000')
        };
    }

    private getDefaultSearchConfig(): SearchConfig {
        return {
            defaultTopK: parseInt(process.env.SEARCH_DEFAULT_TOP_K || '10'),
            maxTopK: parseInt(process.env.SEARCH_MAX_TOP_K || '100'),
            similarityThreshold: parseFloat(process.env.SEARCH_SIMILARITY_THRESHOLD || '0.7'),
            hybridSearch: {
                enabled: process.env.HYBRID_SEARCH_ENABLED === 'true',
                vectorWeight: parseFloat(process.env.HYBRID_SEARCH_VECTOR_WEIGHT || '0.7'),
                keywordWeight: parseFloat(process.env.HYBRID_SEARCH_KEYWORD_WEIGHT || '0.3')
            },
            reranking: {
                enabled: process.env.RERANKING_ENABLED === 'true',
                model: process.env.RERANKING_MODEL
            }
        };
    }

    private getDefaultMonitoringConfig(): MonitoringConfig {
        return {
            metrics: {
                enabled: process.env.METRICS_ENABLED !== 'false',
                port: parseInt(process.env.METRICS_PORT || '9090'),
                path: process.env.METRICS_PATH || '/metrics'
            },
            logging: {
                level: (process.env.LOG_LEVEL as any) || 'info',
                format: (process.env.LOG_FORMAT as any) || 'json',
                file: process.env.LOG_FILE
            },
            healthCheck: {
                interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
                timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000')
            }
        };
    }

    public toJSON(): SystemConfig {
        return {
            server: this.server,
            database: this.database,
            cache: this.cache,
            embedding: this.embedding,
            search: this.search,
            monitoring: this.monitoring,
            dataSources: this.dataSources
        };
    }

    public static fromJSON(data: any): SystemConfigModel {
        return new SystemConfigModel(data);
    }

    public static fromEnvironment(): SystemConfigModel {
        return new SystemConfigModel({});
    }

    public static loadFromFile(filePath: string): SystemConfigModel {
        try {
            const fs = require('fs');
            const configData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return new SystemConfigModel(configData);
        } catch (error) {
            throw new Error(`Failed to load configuration from file ${filePath}: ${error}`);
        }
    }
}