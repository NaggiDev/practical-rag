"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingService = void 0;
const inference_1 = require("@huggingface/inference");
const transformers_1 = require("@xenova/transformers");
const openai_1 = __importDefault(require("openai"));
const errors_1 = require("../utils/errors");
class EmbeddingService {
    constructor(config, redis) {
        this.isInitialized = false;
        this.config = {
            maxTokens: 512,
            batchSize: 32,
            timeout: 30000,
            cacheEnabled: true,
            cacheTTL: 3600,
            ...config
        };
        this.redis = redis;
    }
    async initialize() {
        if (this.isInitialized) {
            return;
        }
        try {
            switch (this.config.provider) {
                case 'huggingface':
                    if (!this.config.apiKey) {
                        throw new errors_1.DataSourceError('HuggingFace API key is required', 'MISSING_API_KEY');
                    }
                    this.hfClient = new inference_1.HfInference(this.config.apiKey);
                    break;
                case 'openai':
                    if (!this.config.apiKey) {
                        throw new errors_1.DataSourceError('OpenAI API key is required', 'MISSING_API_KEY');
                    }
                    this.openaiClient = new openai_1.default({
                        apiKey: this.config.apiKey,
                        timeout: this.config.timeout
                    });
                    break;
                case 'local':
                    this.localPipeline = await (0, transformers_1.pipeline)('feature-extraction', this.config.model);
                    break;
                default:
                    throw new errors_1.DataSourceError(`Unsupported embedding provider: ${this.config.provider}`, 'INVALID_PROVIDER');
            }
            this.isInitialized = true;
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to initialize embedding service: ${error instanceof Error ? error.message : 'Unknown error'}`, 'INITIALIZATION_ERROR');
        }
    }
    async generateEmbedding(text) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const cacheKey = this.getCacheKey(text);
        if (this.config.cacheEnabled && this.redis) {
            const cached = await this.getCachedEmbedding(cacheKey);
            if (cached) {
                return {
                    ...cached,
                    cached: true
                };
            }
        }
        try {
            const embedding = await this.computeEmbedding(text);
            const result = {
                text,
                embedding,
                model: this.config.model,
                timestamp: new Date(),
                cached: false
            };
            if (this.config.cacheEnabled && this.redis) {
                await this.cacheEmbedding(cacheKey, result);
            }
            return result;
        }
        catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('timeout')) {
                    throw new errors_1.TimeoutError(`Embedding generation timed out for text: ${text.substring(0, 100)}...`, 'embedding_generation', 30000);
                }
                if (error.message.includes('rate limit')) {
                    throw new errors_1.RateLimitError(`Rate limit exceeded for embedding generation`);
                }
            }
            throw new errors_1.DataSourceError(`Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`, 'EMBEDDING_GENERATION_ERROR');
        }
    }
    async batchEmbeddings(texts) {
        if (!this.isInitialized) {
            await this.initialize();
        }
        const startTime = Date.now();
        const results = [];
        let cacheHits = 0;
        const batchSize = this.config.batchSize || 32;
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchResults = await this.processBatch(batch);
            results.push(...batchResults.results);
            cacheHits += batchResults.cacheHits;
        }
        const processingTime = Date.now() - startTime;
        return {
            results,
            totalProcessed: texts.length,
            processingTime,
            cacheHits
        };
    }
    async processBatch(texts) {
        const results = [];
        const uncachedTexts = [];
        const uncachedIndices = [];
        let cacheHits = 0;
        if (this.config.cacheEnabled && this.redis) {
            for (let i = 0; i < texts.length; i++) {
                const text = texts[i];
                const cacheKey = this.getCacheKey(text);
                const cached = await this.getCachedEmbedding(cacheKey);
                if (cached) {
                    results[i] = { ...cached, cached: true };
                    cacheHits++;
                }
                else {
                    uncachedTexts.push(text);
                    uncachedIndices.push(i);
                }
            }
        }
        else {
            uncachedTexts.push(...texts);
            uncachedIndices.push(...texts.map((_, i) => i));
        }
        if (uncachedTexts.length > 0) {
            const embeddings = await this.computeBatchEmbeddings(uncachedTexts);
            for (let i = 0; i < uncachedTexts.length; i++) {
                const text = uncachedTexts[i];
                const embedding = embeddings[i];
                const result = {
                    text,
                    embedding,
                    model: this.config.model,
                    timestamp: new Date(),
                    cached: false
                };
                const originalIndex = uncachedIndices[i];
                results[originalIndex] = result;
                if (this.config.cacheEnabled && this.redis) {
                    const cacheKey = this.getCacheKey(text);
                    await this.cacheEmbedding(cacheKey, result);
                }
            }
        }
        return { results, cacheHits };
    }
    async computeEmbedding(text) {
        const truncatedText = this.truncateText(text);
        switch (this.config.provider) {
            case 'huggingface':
                if (!this.hfClient) {
                    throw new errors_1.DataSourceError('HuggingFace client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const hfResult = await this.hfClient.featureExtraction({
                    model: this.config.model,
                    inputs: truncatedText
                });
                return Array.isArray(hfResult) ? hfResult.flat() : [];
            case 'openai':
                if (!this.openaiClient) {
                    throw new errors_1.DataSourceError('OpenAI client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const openaiResult = await this.openaiClient.embeddings.create({
                    model: this.config.model,
                    input: truncatedText
                });
                return openaiResult.data[0]?.embedding || [];
            case 'local':
                if (!this.localPipeline) {
                    throw new errors_1.DataSourceError('Local pipeline not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const localResult = await this.localPipeline(truncatedText);
                return Array.isArray(localResult) ? localResult.flat() : [];
            default:
                throw new errors_1.DataSourceError(`Unsupported provider: ${this.config.provider}`, 'INVALID_PROVIDER');
        }
    }
    async computeBatchEmbeddings(texts) {
        const truncatedTexts = texts.map(text => this.truncateText(text));
        switch (this.config.provider) {
            case 'huggingface':
                if (!this.hfClient) {
                    throw new errors_1.DataSourceError('HuggingFace client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const hfResults = [];
                for (const text of truncatedTexts) {
                    const result = await this.hfClient.featureExtraction({
                        model: this.config.model,
                        inputs: text
                    });
                    hfResults.push(Array.isArray(result) ? result.flat() : []);
                }
                return hfResults;
            case 'openai':
                if (!this.openaiClient) {
                    throw new errors_1.DataSourceError('OpenAI client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const openaiResult = await this.openaiClient.embeddings.create({
                    model: this.config.model,
                    input: truncatedTexts
                });
                return openaiResult.data.map(item => item.embedding);
            case 'local':
                if (!this.localPipeline) {
                    throw new errors_1.DataSourceError('Local pipeline not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const localResults = [];
                for (const text of truncatedTexts) {
                    const result = await this.localPipeline(text);
                    localResults.push(Array.isArray(result) ? result.flat() : []);
                }
                return localResults;
            default:
                throw new errors_1.DataSourceError(`Unsupported provider: ${this.config.provider}`, 'INVALID_PROVIDER');
        }
    }
    truncateText(text) {
        const maxTokens = this.config.maxTokens || 512;
        const maxChars = maxTokens * 4;
        return text.length > maxChars ? text.substring(0, maxChars) : text;
    }
    getCacheKey(text) {
        const textHash = this.hashString(text);
        return `embedding:${this.config.provider}:${this.config.model}:${textHash}`;
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
    async getCachedEmbedding(cacheKey) {
        if (!this.redis) {
            return null;
        }
        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        }
        catch (error) {
            console.warn(`Failed to get cached embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return null;
    }
    async cacheEmbedding(cacheKey, result) {
        if (!this.redis) {
            return;
        }
        try {
            const ttl = this.config.cacheTTL || 3600;
            await this.redis.setex(cacheKey, ttl, JSON.stringify(result));
        }
        catch (error) {
            console.warn(`Failed to cache embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async clearCache() {
        if (!this.redis) {
            return;
        }
        try {
            const pattern = `embedding:${this.config.provider}:${this.config.model}:*`;
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        }
        catch (error) {
            throw new errors_1.DataSourceError(`Failed to clear embedding cache: ${error instanceof Error ? error.message : 'Unknown error'}`, 'CACHE_CLEAR_ERROR');
        }
    }
    getConfig() {
        return { ...this.config };
    }
    async healthCheck() {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }
            const testText = "Health check test";
            const result = await this.generateEmbedding(testText);
            return {
                status: 'healthy',
                details: {
                    provider: this.config.provider,
                    model: this.config.model,
                    embeddingDimension: result.embedding.length,
                    cacheEnabled: this.config.cacheEnabled,
                    lastCheck: new Date().toISOString()
                }
            };
        }
        catch (error) {
            return {
                status: 'unhealthy',
                details: {
                    provider: this.config.provider,
                    model: this.config.model,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    lastCheck: new Date().toISOString()
                }
            };
        }
    }
}
exports.EmbeddingService = EmbeddingService;
//# sourceMappingURL=embedding.js.map