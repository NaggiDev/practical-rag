import { SystemConfig } from '../models/config';
import { defaultConfig } from './defaults';

export function loadFromEnv(): SystemConfig {
    return {
        server: {
            port: parseInt(process.env.PORT || String(defaultConfig.server.port)),
            host: process.env.HOST || defaultConfig.server.host,
            cors: {
                enabled: process.env.CORS_ENABLED !== 'false',
                origins: process.env.CORS_ORIGINS?.split(',') || defaultConfig.server.cors.origins
            },
            rateLimit: {
                windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(defaultConfig.server.rateLimit.windowMs)),
                maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || String(defaultConfig.server.rateLimit.maxRequests))
            },
            timeout: parseInt(process.env.SERVER_TIMEOUT || String(defaultConfig.server.timeout))
        },
        database: {
            vector: {
                provider: (process.env.VECTOR_DB_PROVIDER as any) || defaultConfig.database.vector.provider,
                connectionString: process.env.VECTOR_DB_CONNECTION_STRING,
                apiKey: process.env.VECTOR_DB_API_KEY,
                indexName: process.env.VECTOR_DB_INDEX_NAME || defaultConfig.database.vector.indexName,
                dimension: parseInt(process.env.VECTOR_DB_DIMENSION || String(defaultConfig.database.vector.dimension))
            },
            metadata: {
                provider: (process.env.METADATA_DB_PROVIDER as any) || defaultConfig.database.metadata.provider,
                connectionString: process.env.METADATA_DB_CONNECTION_STRING || defaultConfig.database.metadata.connectionString
            }
        },
        cache: {
            redis: {
                host: process.env.REDIS_HOST || defaultConfig.cache.redis.host,
                port: parseInt(process.env.REDIS_PORT || String(defaultConfig.cache.redis.port)),
                password: process.env.REDIS_PASSWORD,
                db: parseInt(process.env.REDIS_DB || String(defaultConfig.cache.redis.db))
            },
            ttl: {
                queryResults: parseInt(process.env.CACHE_TTL_QUERY_RESULTS || String(defaultConfig.cache.ttl.queryResults)),
                embeddings: parseInt(process.env.CACHE_TTL_EMBEDDINGS || String(defaultConfig.cache.ttl.embeddings)),
                healthChecks: parseInt(process.env.CACHE_TTL_HEALTH_CHECKS || String(defaultConfig.cache.ttl.healthChecks))
            },
            maxMemory: process.env.REDIS_MAX_MEMORY || defaultConfig.cache.maxMemory,
            evictionPolicy: (process.env.REDIS_EVICTION_POLICY as any) || defaultConfig.cache.evictionPolicy
        },
        embedding: {
            provider: (process.env.EMBEDDING_PROVIDER as any) || defaultConfig.embedding.provider,
            model: process.env.EMBEDDING_MODEL || defaultConfig.embedding.model,
            apiKey: process.env.EMBEDDING_API_KEY,
            dimension: parseInt(process.env.EMBEDDING_DIMENSION || String(defaultConfig.embedding.dimension)),
            batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || String(defaultConfig.embedding.batchSize)),
            timeout: parseInt(process.env.EMBEDDING_TIMEOUT || String(defaultConfig.embedding.timeout))
        },
        search: {
            defaultTopK: parseInt(process.env.SEARCH_DEFAULT_TOP_K || String(defaultConfig.search.defaultTopK)),
            maxTopK: parseInt(process.env.SEARCH_MAX_TOP_K || String(defaultConfig.search.maxTopK)),
            similarityThreshold: parseFloat(process.env.SEARCH_SIMILARITY_THRESHOLD || String(defaultConfig.search.similarityThreshold)),
            hybridSearch: {
                enabled: process.env.HYBRID_SEARCH_ENABLED !== 'false',
                vectorWeight: parseFloat(process.env.HYBRID_SEARCH_VECTOR_WEIGHT || String(defaultConfig.search.hybridSearch.vectorWeight)),
                keywordWeight: parseFloat(process.env.HYBRID_SEARCH_KEYWORD_WEIGHT || String(defaultConfig.search.hybridSearch.keywordWeight))
            },
            reranking: {
                enabled: process.env.RERANKING_ENABLED === 'true',
                model: process.env.RERANKING_MODEL
            }
        },
        monitoring: {
            metrics: {
                enabled: process.env.METRICS_ENABLED !== 'false',
                port: parseInt(process.env.METRICS_PORT || String(defaultConfig.monitoring.metrics.port)),
                path: process.env.METRICS_PATH || defaultConfig.monitoring.metrics.path
            },
            logging: {
                level: (process.env.LOG_LEVEL as any) || defaultConfig.monitoring.logging.level,
                format: (process.env.LOG_FORMAT as any) || defaultConfig.monitoring.logging.format,
                file: process.env.LOG_FILE
            },
            healthCheck: {
                interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || String(defaultConfig.monitoring.healthCheck.interval)),
                timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || String(defaultConfig.monitoring.healthCheck.timeout))
            }
        },
        dataSources: []
    };
}