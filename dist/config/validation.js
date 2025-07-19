"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateConfig = validateConfig;
const joi_1 = __importDefault(require("joi"));
const configSchema = joi_1.default.object({
    server: joi_1.default.object({
        port: joi_1.default.number().port().required(),
        host: joi_1.default.string().required(),
        cors: joi_1.default.object({
            enabled: joi_1.default.boolean().required(),
            origins: joi_1.default.array().items(joi_1.default.string()).required()
        }).required(),
        rateLimit: joi_1.default.object({
            windowMs: joi_1.default.number().positive().required(),
            maxRequests: joi_1.default.number().positive().required()
        }).required(),
        timeout: joi_1.default.number().positive().required()
    }).required(),
    database: joi_1.default.object({
        vector: joi_1.default.object({
            provider: joi_1.default.string().valid('faiss', 'pinecone', 'weaviate', 'qdrant').required(),
            connectionString: joi_1.default.string().optional(),
            apiKey: joi_1.default.string().optional(),
            indexName: joi_1.default.string().required(),
            dimension: joi_1.default.number().positive().required()
        }).required(),
        metadata: joi_1.default.object({
            provider: joi_1.default.string().valid('postgresql', 'mongodb', 'sqlite').required(),
            connectionString: joi_1.default.string().required()
        }).required()
    }).required(),
    cache: joi_1.default.object({
        redis: joi_1.default.object({
            host: joi_1.default.string().required(),
            port: joi_1.default.number().port().required(),
            password: joi_1.default.string().optional(),
            db: joi_1.default.number().min(0).required()
        }).required(),
        ttl: joi_1.default.object({
            queryResults: joi_1.default.number().positive().required(),
            embeddings: joi_1.default.number().positive().required(),
            healthChecks: joi_1.default.number().positive().required()
        }).required(),
        maxMemory: joi_1.default.string().required(),
        evictionPolicy: joi_1.default.string().valid('allkeys-lru', 'volatile-lru', 'allkeys-lfu').required()
    }).required(),
    embedding: joi_1.default.object({
        provider: joi_1.default.string().valid('openai', 'huggingface', 'sentence-transformers', 'local').required(),
        model: joi_1.default.string().required(),
        apiKey: joi_1.default.string().optional(),
        dimension: joi_1.default.number().positive().required(),
        batchSize: joi_1.default.number().positive().required(),
        timeout: joi_1.default.number().positive().required()
    }).required(),
    search: joi_1.default.object({
        defaultTopK: joi_1.default.number().positive().required(),
        maxTopK: joi_1.default.number().positive().required(),
        similarityThreshold: joi_1.default.number().min(0).max(1).required(),
        hybridSearch: joi_1.default.object({
            enabled: joi_1.default.boolean().required(),
            vectorWeight: joi_1.default.number().min(0).max(1).required(),
            keywordWeight: joi_1.default.number().min(0).max(1).required()
        }).required(),
        reranking: joi_1.default.object({
            enabled: joi_1.default.boolean().required(),
            model: joi_1.default.string().optional()
        }).required()
    }).required(),
    monitoring: joi_1.default.object({
        metrics: joi_1.default.object({
            enabled: joi_1.default.boolean().required(),
            port: joi_1.default.number().port().required(),
            path: joi_1.default.string().required()
        }).required(),
        logging: joi_1.default.object({
            level: joi_1.default.string().valid('debug', 'info', 'warn', 'error').required(),
            format: joi_1.default.string().valid('json', 'text').required(),
            file: joi_1.default.string().optional()
        }).required(),
        healthCheck: joi_1.default.object({
            interval: joi_1.default.number().positive().required(),
            timeout: joi_1.default.number().positive().required()
        }).required()
    }).required(),
    dataSources: joi_1.default.array().items(joi_1.default.object({
        connectionString: joi_1.default.string().optional(),
        apiEndpoint: joi_1.default.string().optional(),
        filePath: joi_1.default.string().optional(),
        credentials: joi_1.default.object().optional(),
        syncInterval: joi_1.default.number().positive().optional(),
        batchSize: joi_1.default.number().positive().optional(),
        timeout: joi_1.default.number().positive().optional(),
        retryAttempts: joi_1.default.number().min(0).optional()
    })).required()
});
function validateConfig(config) {
    const { error, value } = configSchema.validate(config, {
        allowUnknown: false,
        stripUnknown: true
    });
    if (error) {
        throw new Error(`Configuration validation failed: ${error.details.map(d => d.message).join(', ')}`);
    }
    validateCrossFieldConstraints(value);
    return value;
}
function validateCrossFieldConstraints(config) {
    const { vectorWeight, keywordWeight } = config.search.hybridSearch;
    if (Math.abs(vectorWeight + keywordWeight - 1) > 0.001) {
        throw new Error('Hybrid search vector and keyword weights must sum to 1.0');
    }
    if (config.embedding.dimension !== config.database.vector.dimension) {
        throw new Error('Embedding dimension must match vector database dimension');
    }
    if (config.embedding.provider === 'openai' && !config.embedding.apiKey) {
        throw new Error('OpenAI API key is required when using OpenAI embedding provider');
    }
    if (config.database.vector.provider === 'pinecone' && !config.database.vector.apiKey) {
        throw new Error('Pinecone API key is required when using Pinecone vector database');
    }
}
//# sourceMappingURL=validation.js.map