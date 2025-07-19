import Joi from 'joi';
import { SystemConfig } from '../models/config';

const configSchema = Joi.object({
    server: Joi.object({
        port: Joi.number().port().required(),
        host: Joi.string().required(),
        cors: Joi.object({
            enabled: Joi.boolean().required(),
            origins: Joi.array().items(Joi.string()).required()
        }).required(),
        rateLimit: Joi.object({
            windowMs: Joi.number().positive().required(),
            maxRequests: Joi.number().positive().required()
        }).required(),
        timeout: Joi.number().positive().required()
    }).required(),

    database: Joi.object({
        vector: Joi.object({
            provider: Joi.string().valid('faiss', 'pinecone', 'weaviate', 'qdrant').required(),
            connectionString: Joi.string().optional(),
            apiKey: Joi.string().optional(),
            indexName: Joi.string().required(),
            dimension: Joi.number().positive().required()
        }).required(),
        metadata: Joi.object({
            provider: Joi.string().valid('postgresql', 'mongodb', 'sqlite').required(),
            connectionString: Joi.string().required()
        }).required()
    }).required(),

    cache: Joi.object({
        redis: Joi.object({
            host: Joi.string().required(),
            port: Joi.number().port().required(),
            password: Joi.string().optional(),
            db: Joi.number().min(0).required()
        }).required(),
        ttl: Joi.object({
            queryResults: Joi.number().positive().required(),
            embeddings: Joi.number().positive().required(),
            healthChecks: Joi.number().positive().required()
        }).required(),
        maxMemory: Joi.string().required(),
        evictionPolicy: Joi.string().valid('allkeys-lru', 'volatile-lru', 'allkeys-lfu').required()
    }).required(),

    embedding: Joi.object({
        provider: Joi.string().valid('openai', 'huggingface', 'sentence-transformers', 'local').required(),
        model: Joi.string().required(),
        apiKey: Joi.string().optional(),
        dimension: Joi.number().positive().required(),
        batchSize: Joi.number().positive().required(),
        timeout: Joi.number().positive().required()
    }).required(),

    search: Joi.object({
        defaultTopK: Joi.number().positive().required(),
        maxTopK: Joi.number().positive().required(),
        similarityThreshold: Joi.number().min(0).max(1).required(),
        hybridSearch: Joi.object({
            enabled: Joi.boolean().required(),
            vectorWeight: Joi.number().min(0).max(1).required(),
            keywordWeight: Joi.number().min(0).max(1).required()
        }).required(),
        reranking: Joi.object({
            enabled: Joi.boolean().required(),
            model: Joi.string().optional()
        }).required()
    }).required(),

    monitoring: Joi.object({
        metrics: Joi.object({
            enabled: Joi.boolean().required(),
            port: Joi.number().port().required(),
            path: Joi.string().required()
        }).required(),
        logging: Joi.object({
            level: Joi.string().valid('debug', 'info', 'warn', 'error').required(),
            format: Joi.string().valid('json', 'text').required(),
            file: Joi.string().optional()
        }).required(),
        healthCheck: Joi.object({
            interval: Joi.number().positive().required(),
            timeout: Joi.number().positive().required()
        }).required()
    }).required(),

    dataSources: Joi.array().items(
        Joi.object({
            connectionString: Joi.string().optional(),
            apiEndpoint: Joi.string().optional(),
            filePath: Joi.string().optional(),
            credentials: Joi.object().optional(),
            syncInterval: Joi.number().positive().optional(),
            batchSize: Joi.number().positive().optional(),
            timeout: Joi.number().positive().optional(),
            retryAttempts: Joi.number().min(0).optional()
        })
    ).required()
});

export function validateConfig(config: any): SystemConfig {
    const { error, value } = configSchema.validate(config, {
        allowUnknown: false,
        stripUnknown: true
    });

    if (error) {
        throw new Error(`Configuration validation failed: ${error.details.map(d => d.message).join(', ')}`);
    }

    // Additional validation logic
    validateCrossFieldConstraints(value);

    return value as SystemConfig;
}

function validateCrossFieldConstraints(config: SystemConfig): void {
    // Validate that hybrid search weights sum to 1
    const { vectorWeight, keywordWeight } = config.search.hybridSearch;
    if (Math.abs(vectorWeight + keywordWeight - 1) > 0.001) {
        throw new Error('Hybrid search vector and keyword weights must sum to 1.0');
    }

    // Validate that embedding dimension matches vector database dimension
    if (config.embedding.dimension !== config.database.vector.dimension) {
        throw new Error('Embedding dimension must match vector database dimension');
    }

    // Validate that required API keys are present for certain providers
    if (config.embedding.provider === 'openai' && !config.embedding.apiKey) {
        throw new Error('OpenAI API key is required when using OpenAI embedding provider');
    }

    if (config.database.vector.provider === 'pinecone' && !config.database.vector.apiKey) {
        throw new Error('Pinecone API key is required when using Pinecone vector database');
    }
}