"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFromEnv = loadFromEnv;
const defaults_1 = require("./defaults");
function loadFromEnv() {
    return {
        server: {
            port: parseInt(process.env.PORT || String(defaults_1.defaultConfig.server.port)),
            host: process.env.HOST || defaults_1.defaultConfig.server.host,
            cors: {
                enabled: process.env.CORS_ENABLED !== 'false',
                origins: process.env.CORS_ORIGINS?.split(',') || defaults_1.defaultConfig.server.cors.origins
            },
            rateLimit: {
                windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(defaults_1.defaultConfig.server.rateLimit.windowMs)),
                maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || String(defaults_1.defaultConfig.server.rateLimit.maxRequests))
            },
            timeout: parseInt(process.env.SERVER_TIMEOUT || String(defaults_1.defaultConfig.server.timeout))
        },
        database: {
            vector: {
                provider: process.env.VECTOR_DB_PROVIDER || defaults_1.defaultConfig.database.vector.provider,
                connectionString: process.env.VECTOR_DB_CONNECTION_STRING,
                apiKey: process.env.VECTOR_DB_API_KEY,
                indexName: process.env.VECTOR_DB_INDEX_NAME || defaults_1.defaultConfig.database.vector.indexName,
                dimension: parseInt(process.env.VECTOR_DB_DIMENSION || String(defaults_1.defaultConfig.database.vector.dimension))
            },
            metadata: {
                provider: process.env.METADATA_DB_PROVIDER || defaults_1.defaultConfig.database.metadata.provider,
                connectionString: process.env.METADATA_DB_CONNECTION_STRING || defaults_1.defaultConfig.database.metadata.connectionString
            }
        },
        cache: {
            redis: {
                host: process.env.REDIS_HOST || defaults_1.defaultConfig.cache.redis.host,
                port: parseInt(process.env.REDIS_PORT || String(defaults_1.defaultConfig.cache.redis.port)),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || String(defaults_1.defaultConfig.cache.redis.db))
            },
            ttl: {
                queryResults: parseInt(process.env.CACHE_TTL_QUERY_RESULTS || String(defaults_1.defaultConfig.cache.ttl.queryResults)),
                embeddings: parseInt(process.env.CACHE_TTL_EMBEDDINGS || String(defaults_1.defaultConfig.cache.ttl.embeddings)),
                healthChecks: parseInt(process.env.CACHE_TTL_HEALTH_CHECKS || String(defaults_1.defaultConfig.cache.ttl.healthChecks))
            },
            maxMemory: process.env.REDIS_MAX_MEMORY || defaults_1.defaultConfig.cache.maxMemory,
            evictionPolicy: process.env.REDIS_EVICTION_POLICY || defaults_1.defaultConfig.cache.evictionPolicy
        },
        embedding: {
            provider: process.env.EMBEDDING_PROVIDER || defaults_1.defaultConfig.embedding.provider,
            model: process.env.EMBEDDING_MODEL || defaults_1.defaultConfig.embedding.model,
            apiKey: process.env.EMBEDDING_API_KEY,
            dimension: parseInt(process.env.EMBEDDING_DIMENSION || String(defaults_1.defaultConfig.embedding.dimension)),
            batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || String(defaults_1.defaultConfig.embedding.batchSize)),
            timeout: parseInt(process.env.EMBEDDING_TIMEOUT || String(defaults_1.defaultConfig.embedding.timeout))
        },
        search: {
            defaultTopK: parseInt(process.env.SEARCH_DEFAULT_TOP_K || String(defaults_1.defaultConfig.search.defaultTopK)),
            maxTopK: parseInt(process.env.SEARCH_MAX_TOP_K || String(defaults_1.defaultConfig.search.maxTopK)),
            similarityThreshold: parseFloat(process.env.SEARCH_SIMILARITY_THRESHOLD || String(defaults_1.defaultConfig.search.similarityThreshold)),
            hybridSearch: {
                enabled: process.env.HYBRID_SEARCH_ENABLED !== 'false',
                vectorWeight: parseFloat(process.env.HYBRID_SEARCH_VECTOR_WEIGHT || String(defaults_1.defaultConfig.search.hybridSearch.vectorWeight)),
                keywordWeight: parseFloat(process.env.HYBRID_SEARCH_KEYWORD_WEIGHT || String(defaults_1.defaultConfig.search.hybridSearch.keywordWeight))
            },
            reranking: {
                enabled: process.env.RERANKING_ENABLED === 'true',
                model: process.env.RERANKING_MODEL
            }
        },
        monitoring: {
            metrics: {
                enabled: process.env.METRICS_ENABLED !== 'false',
                port: parseInt(process.env.METRICS_PORT || String(defaults_1.defaultConfig.monitoring.metrics.port)),
                path: process.env.METRICS_PATH || defaults_1.defaultConfig.monitoring.metrics.path
            },
            logging: {
                level: process.env.LOG_LEVEL || defaults_1.defaultConfig.monitoring.logging.level,
                format: process.env.LOG_FORMAT || defaults_1.defaultConfig.monitoring.logging.format,
                file: process.env.LOG_FILE
            },
            healthCheck: {
                interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || String(defaults_1.defaultConfig.monitoring.healthCheck.interval)),
                timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || String(defaults_1.defaultConfig.monitoring.healthCheck.timeout))
            }
        },
        dataSources: []
    };
}
//# sourceMappingURL=env.js.map