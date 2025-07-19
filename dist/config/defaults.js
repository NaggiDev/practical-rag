"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultConfig = void 0;
exports.defaultConfig = {
    server: {
        port: 3000,
        host: '0.0.0.0',
        cors: {
            enabled: true,
            origins: ['*']
        },
        rateLimit: {
            windowMs: 15 * 60 * 1000,
            maxRequests: 100
        },
        timeout: 30000
    },
    database: {
        vector: {
            provider: 'faiss',
            indexName: 'rag-index',
            dimension: 384
        },
        metadata: {
            provider: 'sqlite',
            connectionString: 'sqlite://./data/metadata.db'
        }
    },
    cache: {
        redis: {
            host: 'localhost',
            port: 6379,
            db: 0
        },
        ttl: {
            queryResults: 3600,
            embeddings: 86400,
            healthChecks: 300
        },
        maxMemory: '256mb',
        evictionPolicy: 'allkeys-lru'
    },
    embedding: {
        provider: 'sentence-transformers',
        model: 'all-MiniLM-L6-v2',
        dimension: 384,
        batchSize: 32,
        timeout: 30000
    },
    search: {
        defaultTopK: 10,
        maxTopK: 100,
        similarityThreshold: 0.7,
        hybridSearch: {
            enabled: true,
            vectorWeight: 0.7,
            keywordWeight: 0.3
        },
        reranking: {
            enabled: false
        }
    },
    monitoring: {
        metrics: {
            enabled: true,
            port: 9090,
            path: '/metrics'
        },
        logging: {
            level: 'info',
            format: 'json'
        },
        healthCheck: {
            interval: 30000,
            timeout: 5000
        }
    },
    dataSources: []
};
//# sourceMappingURL=defaults.js.map