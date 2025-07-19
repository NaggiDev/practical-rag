"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemConfigModel = void 0;
const dotenv = __importStar(require("dotenv"));
const joi_1 = __importDefault(require("joi"));
dotenv.config();
const serverConfigSchema = joi_1.default.object({
    port: joi_1.default.number().integer().min(1).max(65535).required(),
    host: joi_1.default.string().required().min(1).max(255),
    cors: joi_1.default.object({
        enabled: joi_1.default.boolean().required(),
        origins: joi_1.default.array().items(joi_1.default.alternatives().try(joi_1.default.string().uri(), joi_1.default.string().valid('*'))).required()
    }).required(),
    rateLimit: joi_1.default.object({
        windowMs: joi_1.default.number().integer().min(1000).max(3600000).required(),
        maxRequests: joi_1.default.number().integer().min(1).max(10000).required()
    }).required(),
    timeout: joi_1.default.number().integer().min(1000).max(300000).required()
});
const databaseConfigSchema = joi_1.default.object({
    vector: joi_1.default.object({
        provider: joi_1.default.string().valid('faiss', 'pinecone', 'weaviate', 'qdrant').required(),
        connectionString: joi_1.default.string().optional().min(1).max(1000),
        apiKey: joi_1.default.string().optional().min(1).max(500),
        indexName: joi_1.default.string().required().min(1).max(100),
        dimension: joi_1.default.number().integer().min(1).max(10000).required()
    }).required(),
    metadata: joi_1.default.object({
        provider: joi_1.default.string().valid('postgresql', 'mongodb', 'sqlite').required(),
        connectionString: joi_1.default.string().required().min(1).max(1000)
    }).required()
});
const cacheConfigSchema = joi_1.default.object({
    redis: joi_1.default.object({
        host: joi_1.default.string().required().min(1).max(255),
        port: joi_1.default.number().integer().min(1).max(65535).required(),
        password: joi_1.default.string().optional().min(1).max(500),
        db: joi_1.default.number().integer().min(0).max(15).required()
    }).required(),
    ttl: joi_1.default.object({
        queryResults: joi_1.default.number().integer().min(60).max(86400).required(),
        embeddings: joi_1.default.number().integer().min(300).max(604800).required(),
        healthChecks: joi_1.default.number().integer().min(30).max(3600).required()
    }).required(),
    maxMemory: joi_1.default.string().required().pattern(/^\d+[kmg]b$/i),
    evictionPolicy: joi_1.default.string().valid('allkeys-lru', 'volatile-lru', 'allkeys-lfu').required()
});
const embeddingConfigSchema = joi_1.default.object({
    provider: joi_1.default.string().valid('openai', 'huggingface', 'sentence-transformers', 'local').required(),
    model: joi_1.default.string().required().min(1).max(200),
    apiKey: joi_1.default.string().optional().min(1).max(500),
    dimension: joi_1.default.number().integer().min(1).max(10000).required(),
    batchSize: joi_1.default.number().integer().min(1).max(1000).required(),
    timeout: joi_1.default.number().integer().min(1000).max(300000).required()
});
const searchConfigSchema = joi_1.default.object({
    defaultTopK: joi_1.default.number().integer().min(1).max(1000).required(),
    maxTopK: joi_1.default.number().integer().min(1).max(1000).required(),
    similarityThreshold: joi_1.default.number().min(0).max(1).required(),
    hybridSearch: joi_1.default.object({
        enabled: joi_1.default.boolean().required(),
        vectorWeight: joi_1.default.number().min(0).max(1).required(),
        keywordWeight: joi_1.default.number().min(0).max(1).required()
    }).required(),
    reranking: joi_1.default.object({
        enabled: joi_1.default.boolean().required(),
        model: joi_1.default.string().optional().min(1).max(200)
    }).required()
});
const monitoringConfigSchema = joi_1.default.object({
    metrics: joi_1.default.object({
        enabled: joi_1.default.boolean().required(),
        port: joi_1.default.number().integer().min(1).max(65535).required(),
        path: joi_1.default.string().required().min(1).max(100)
    }).required(),
    logging: joi_1.default.object({
        level: joi_1.default.string().valid('debug', 'info', 'warn', 'error').required(),
        format: joi_1.default.string().valid('json', 'text').required(),
        file: joi_1.default.string().optional().min(1).max(500)
    }).required(),
    healthCheck: joi_1.default.object({
        interval: joi_1.default.number().integer().min(1000).max(300000).required(),
        timeout: joi_1.default.number().integer().min(1000).max(60000).required()
    }).required()
});
const systemConfigSchema = joi_1.default.object({
    server: serverConfigSchema.required(),
    database: databaseConfigSchema.required(),
    cache: cacheConfigSchema.required(),
    embedding: embeddingConfigSchema.required(),
    search: searchConfigSchema.required(),
    monitoring: monitoringConfigSchema.required(),
    dataSources: joi_1.default.array().items(joi_1.default.object()).required()
});
class SystemConfigModel {
    constructor(data) {
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
    sanitize(data) {
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
    sanitizeServerConfig(config) {
        if (!config)
            return this.getDefaultServerConfig();
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
    sanitizeDatabaseConfig(config) {
        if (!config)
            return this.getDefaultDatabaseConfig();
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
    sanitizeCacheConfig(config) {
        if (!config)
            return this.getDefaultCacheConfig();
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
    sanitizeEmbeddingConfig(config) {
        if (!config)
            return this.getDefaultEmbeddingConfig();
        return {
            provider: config.provider || 'sentence-transformers',
            model: typeof config.model === 'string' ? config.model.trim() : 'all-MiniLM-L6-v2',
            apiKey: typeof config.apiKey === 'string' ? config.apiKey.trim() : undefined,
            dimension: typeof config.dimension === 'number' ? Math.max(1, Math.min(10000, Math.floor(config.dimension))) : 384,
            batchSize: typeof config.batchSize === 'number' ? Math.max(1, Math.min(1000, Math.floor(config.batchSize))) : 32,
            timeout: typeof config.timeout === 'number' ? Math.max(1000, Math.min(300000, config.timeout)) : 30000
        };
    }
    sanitizeSearchConfig(config) {
        if (!config)
            return this.getDefaultSearchConfig();
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
    sanitizeMonitoringConfig(config) {
        if (!config)
            return this.getDefaultMonitoringConfig();
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
    validate(data) {
        const { error, value } = systemConfigSchema.validate(data, { abortEarly: false });
        if (error) {
            throw new Error(`SystemConfig validation failed: ${error.details.map(d => d.message).join(', ')}`);
        }
        return value;
    }
    getDefaultServerConfig() {
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
    getDefaultDatabaseConfig() {
        return {
            vector: {
                provider: process.env.VECTOR_DB_PROVIDER || 'faiss',
                connectionString: process.env.VECTOR_DB_CONNECTION_STRING,
                apiKey: process.env.VECTOR_DB_API_KEY,
                indexName: process.env.VECTOR_DB_INDEX_NAME || 'default-index',
                dimension: parseInt(process.env.VECTOR_DB_DIMENSION || '384')
            },
            metadata: {
                provider: process.env.METADATA_DB_PROVIDER || 'sqlite',
                connectionString: process.env.METADATA_DB_CONNECTION_STRING || 'sqlite:./data/metadata.db'
            }
        };
    }
    getDefaultCacheConfig() {
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
            evictionPolicy: process.env.REDIS_EVICTION_POLICY || 'allkeys-lru'
        };
    }
    getDefaultEmbeddingConfig() {
        return {
            provider: process.env.EMBEDDING_PROVIDER || 'sentence-transformers',
            model: process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2',
            apiKey: process.env.EMBEDDING_API_KEY,
            dimension: parseInt(process.env.EMBEDDING_DIMENSION || '384'),
            batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '32'),
            timeout: parseInt(process.env.EMBEDDING_TIMEOUT || '30000')
        };
    }
    getDefaultSearchConfig() {
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
    getDefaultMonitoringConfig() {
        return {
            metrics: {
                enabled: process.env.METRICS_ENABLED !== 'false',
                port: parseInt(process.env.METRICS_PORT || '9090'),
                path: process.env.METRICS_PATH || '/metrics'
            },
            logging: {
                level: process.env.LOG_LEVEL || 'info',
                format: process.env.LOG_FORMAT || 'json',
                file: process.env.LOG_FILE
            },
            healthCheck: {
                interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'),
                timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000')
            }
        };
    }
    toJSON() {
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
    static fromJSON(data) {
        return new SystemConfigModel(data);
    }
    static fromEnvironment() {
        return new SystemConfigModel({});
    }
    static loadFromFile(filePath) {
        try {
            const fs = require('fs');
            const configData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return new SystemConfigModel(configData);
        }
        catch (error) {
            throw new Error(`Failed to load configuration from file ${filePath}: ${error}`);
        }
    }
}
exports.SystemConfigModel = SystemConfigModel;
//# sourceMappingURL=config.js.map