import { HfInference } from '@huggingface/inference';
import { pipeline } from '@xenova/transformers';
import Redis from 'ioredis';
import OpenAI from 'openai';
import { DataSourceError, RateLimitError, TimeoutError } from '../utils/errors';

export interface EmbeddingConfig {
    provider: 'huggingface' | 'openai' | 'local';
    model: string;
    apiKey?: string;
    maxTokens?: number;
    batchSize?: number;
    timeout?: number;
    cacheEnabled?: boolean;
    cacheTTL?: number;
}

export interface EmbeddingResult {
    text: string;
    embedding: number[];
    model: string;
    timestamp: Date;
    cached: boolean;
}

export interface BatchEmbeddingResult {
    results: EmbeddingResult[];
    totalProcessed: number;
    processingTime: number;
    cacheHits: number;
}

export class EmbeddingService {
    private config: EmbeddingConfig;
    private hfClient?: HfInference;
    private openaiClient?: OpenAI;
    private localPipeline?: any;
    private redis?: Redis;
    private isInitialized: boolean = false;

    constructor(config: EmbeddingConfig, redis?: Redis) {
        this.config = {
            maxTokens: 512,
            batchSize: 32,
            timeout: 30000,
            cacheEnabled: true,
            cacheTTL: 3600, // 1 hour
            ...config
        };
        this.redis = redis;
    }

    public async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            switch (this.config.provider) {
                case 'huggingface':
                    if (!this.config.apiKey) {
                        throw new DataSourceError('HuggingFace API key is required', 'MISSING_API_KEY');
                    }
                    this.hfClient = new HfInference(this.config.apiKey);
                    break;

                case 'openai':
                    if (!this.config.apiKey) {
                        throw new DataSourceError('OpenAI API key is required', 'MISSING_API_KEY');
                    }
                    this.openaiClient = new OpenAI({
                        apiKey: this.config.apiKey,
                        timeout: this.config.timeout
                    });
                    break;

                case 'local':
                    this.localPipeline = await pipeline('feature-extraction', this.config.model);
                    break;

                default:
                    throw new DataSourceError(`Unsupported embedding provider: ${this.config.provider}`, 'INVALID_PROVIDER');
            }

            this.isInitialized = true;
        } catch (error) {
            throw new DataSourceError(
                `Failed to initialize embedding service: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'INITIALIZATION_ERROR'
            );
        }
    }

    public async generateEmbedding(text: string): Promise<EmbeddingResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const cacheKey = this.getCacheKey(text);

        // Check cache first
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
            const result: EmbeddingResult = {
                text,
                embedding,
                model: this.config.model,
                timestamp: new Date(),
                cached: false
            };

            // Cache the result
            if (this.config.cacheEnabled && this.redis) {
                await this.cacheEmbedding(cacheKey, result);
            }

            return result;
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('timeout')) {
                    throw new TimeoutError(`Embedding generation timed out for text: ${text.substring(0, 100)}...`);
                }
                if (error.message.includes('rate limit')) {
                    throw new RateLimitError(`Rate limit exceeded for embedding generation`);
                }
            }
            throw new DataSourceError(
                `Failed to generate embedding: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'EMBEDDING_GENERATION_ERROR'
            );
        }
    }

    public async batchEmbeddings(texts: string[]): Promise<BatchEmbeddingResult> {
        if (!this.isInitialized) {
            await this.initialize();
        }

        const startTime = Date.now();
        const results: EmbeddingResult[] = [];
        let cacheHits = 0;

        // Process in batches
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

    private async processBatch(texts: string[]): Promise<{ results: EmbeddingResult[]; cacheHits: number }> {
        const results: EmbeddingResult[] = [];
        const uncachedTexts: string[] = [];
        const uncachedIndices: number[] = [];
        let cacheHits = 0;

        // Check cache for all texts in batch
        if (this.config.cacheEnabled && this.redis) {
            for (let i = 0; i < texts.length; i++) {
                const text = texts[i]!;
                const cacheKey = this.getCacheKey(text);
                const cached = await this.getCachedEmbedding(cacheKey);

                if (cached) {
                    results[i] = { ...cached, cached: true };
                    cacheHits++;
                } else {
                    uncachedTexts.push(text);
                    uncachedIndices.push(i);
                }
            }
        } else {
            uncachedTexts.push(...texts);
            uncachedIndices.push(...texts.map((_, i) => i));
        }

        // Process uncached texts
        if (uncachedTexts.length > 0) {
            const embeddings = await this.computeBatchEmbeddings(uncachedTexts);

            for (let i = 0; i < uncachedTexts.length; i++) {
                const text = uncachedTexts[i]!;
                const embedding = embeddings[i]!;
                const result: EmbeddingResult = {
                    text,
                    embedding,
                    model: this.config.model,
                    timestamp: new Date(),
                    cached: false
                };

                const originalIndex = uncachedIndices[i]!;
                results[originalIndex] = result;

                // Cache the result
                if (this.config.cacheEnabled && this.redis) {
                    const cacheKey = this.getCacheKey(text);
                    await this.cacheEmbedding(cacheKey, result);
                }
            }
        }

        return { results, cacheHits };
    }

    private async computeEmbedding(text: string): Promise<number[]> {
        const truncatedText = this.truncateText(text);

        switch (this.config.provider) {
            case 'huggingface':
                if (!this.hfClient) {
                    throw new DataSourceError('HuggingFace client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const hfResult = await this.hfClient.featureExtraction({
                    model: this.config.model,
                    inputs: truncatedText
                });
                return Array.isArray(hfResult) ? (hfResult as number[]).flat() : [];

            case 'openai':
                if (!this.openaiClient) {
                    throw new DataSourceError('OpenAI client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const openaiResult = await this.openaiClient.embeddings.create({
                    model: this.config.model,
                    input: truncatedText
                });
                return openaiResult.data[0]?.embedding || [];

            case 'local':
                if (!this.localPipeline) {
                    throw new DataSourceError('Local pipeline not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const localResult = await this.localPipeline(truncatedText);
                return Array.isArray(localResult) ? (localResult as number[]).flat() : [];

            default:
                throw new DataSourceError(`Unsupported provider: ${this.config.provider}`, 'INVALID_PROVIDER');
        }
    }

    private async computeBatchEmbeddings(texts: string[]): Promise<number[][]> {
        const truncatedTexts = texts.map(text => this.truncateText(text));

        switch (this.config.provider) {
            case 'huggingface':
                if (!this.hfClient) {
                    throw new DataSourceError('HuggingFace client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                // HuggingFace doesn't support batch processing directly, so process individually
                const hfResults: number[][] = [];
                for (const text of truncatedTexts) {
                    const result = await this.hfClient.featureExtraction({
                        model: this.config.model,
                        inputs: text
                    });
                    hfResults.push(Array.isArray(result) ? (result as number[]).flat() : []);
                }
                return hfResults;

            case 'openai':
                if (!this.openaiClient) {
                    throw new DataSourceError('OpenAI client not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const openaiResult = await this.openaiClient.embeddings.create({
                    model: this.config.model,
                    input: truncatedTexts
                });
                return openaiResult.data.map(item => item.embedding);

            case 'local':
                if (!this.localPipeline) {
                    throw new DataSourceError('Local pipeline not initialized', 'CLIENT_NOT_INITIALIZED');
                }
                const localResults: number[][] = [];
                for (const text of truncatedTexts) {
                    const result = await this.localPipeline(text);
                    localResults.push(Array.isArray(result) ? (result as number[]).flat() : []);
                }
                return localResults;

            default:
                throw new DataSourceError(`Unsupported provider: ${this.config.provider}`, 'INVALID_PROVIDER');
        }
    }

    private truncateText(text: string): string {
        const maxTokens = this.config.maxTokens || 512;
        // Simple approximation: 1 token ≈ 4 characters
        const maxChars = maxTokens * 4;
        return text.length > maxChars ? text.substring(0, maxChars) : text;
    }

    private getCacheKey(text: string): string {
        const textHash = this.hashString(text);
        return `embedding:${this.config.provider}:${this.config.model}:${textHash}`;
    }

    private hashString(str: string): string {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    private async getCachedEmbedding(cacheKey: string): Promise<EmbeddingResult | null> {
        if (!this.redis) {
            return null;
        }

        try {
            const cached = await this.redis.get(cacheKey);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (error) {
            // Log error but don't fail - just skip cache
            console.warn(`Failed to get cached embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

        return null;
    }

    private async cacheEmbedding(cacheKey: string, result: EmbeddingResult): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            const ttl = this.config.cacheTTL || 3600;
            await this.redis.setex(cacheKey, ttl, JSON.stringify(result));
        } catch (error) {
            // Log error but don't fail - just skip caching
            console.warn(`Failed to cache embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public async clearCache(): Promise<void> {
        if (!this.redis) {
            return;
        }

        try {
            const pattern = `embedding:${this.config.provider}:${this.config.model}:*`;
            const keys = await this.redis.keys(pattern);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } catch (error) {
            throw new DataSourceError(
                `Failed to clear embedding cache: ${error instanceof Error ? error.message : 'Unknown error'}`,
                'CACHE_CLEAR_ERROR'
            );
        }
    }

    public getConfig(): EmbeddingConfig {
        return { ...this.config };
    }

    public async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: object }> {
        try {
            if (!this.isInitialized) {
                await this.initialize();
            }

            // Test with a simple embedding
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
        } catch (error) {
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
