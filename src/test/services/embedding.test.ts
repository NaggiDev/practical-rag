import Redis from 'ioredis';
import { EmbeddingConfig, EmbeddingService } from '../../services/embedding';
import { DataSourceError, RateLimitError, TimeoutError } from '../../utils/errors';

// Mock external dependencies
jest.mock('@huggingface/inference');
jest.mock('openai');
jest.mock('@xenova/transformers');
jest.mock('ioredis');

const mockHfInference = {
    featureExtraction: jest.fn()
};

const mockOpenAI = {
    embeddings: {
        create: jest.fn()
    }
};

const mockPipeline = jest.fn();

const mockRedis = {
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn()
};

// Mock the modules
jest.mock('@huggingface/inference', () => ({
    HfInference: jest.fn(() => mockHfInference)
}));

jest.mock('openai', () => ({
    __esModule: true,
    default: jest.fn(() => mockOpenAI)
}));

jest.mock('@xenova/transformers', () => ({
    pipeline: jest.fn(() => Promise.resolve(mockPipeline))
}));

describe('EmbeddingService', () => {
    let embeddingService: EmbeddingService;
    let mockRedisInstance: jest.Mocked<Redis>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisInstance = mockRedis as any;
    });

    describe('HuggingFace Provider', () => {
        beforeEach(() => {
            const config: EmbeddingConfig = {
                provider: 'huggingface',
                model: 'sentence-transformers/all-MiniLM-L6-v2',
                apiKey: 'test-hf-key',
                batchSize: 2,
                cacheEnabled: true
            };
            embeddingService = new EmbeddingService(config, mockRedisInstance);
        });

        it('should initialize HuggingFace client correctly', async () => {
            await embeddingService.initialize();
            expect(require('@huggingface/inference').HfInference).toHaveBeenCalledWith('test-hf-key');
        });

        it('should throw error when API key is missing', async () => {
            const config: EmbeddingConfig = {
                provider: 'huggingface',
                model: 'test-model'
            };
            const service = new EmbeddingService(config);

            await expect(service.initialize()).rejects.toThrow(DataSourceError);
            await expect(service.initialize()).rejects.toThrow('HuggingFace API key is required');
        });

        it('should generate single embedding successfully', async () => {
            const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
            mockHfInference.featureExtraction.mockResolvedValue(mockEmbedding);
            mockRedisInstance.get.mockResolvedValue(null);

            const result = await embeddingService.generateEmbedding('test text');

            expect(result).toEqual({
                text: 'test text',
                embedding: mockEmbedding,
                model: 'sentence-transformers/all-MiniLM-L6-v2',
                timestamp: expect.any(Date),
                cached: false
            });
            expect(mockHfInference.featureExtraction).toHaveBeenCalledWith({
                model: 'sentence-transformers/all-MiniLM-L6-v2',
                inputs: 'test text'
            });
        });

        it('should return cached embedding when available', async () => {
            const cachedResult = {
                text: 'test text',
                embedding: [0.1, 0.2, 0.3],
                model: 'sentence-transformers/all-MiniLM-L6-v2',
                timestamp: '2025-07-20T05:35:53.971Z',
                cached: false
            };
            mockRedisInstance.get.mockResolvedValue(JSON.stringify(cachedResult));

            const result = await embeddingService.generateEmbedding('test text');

            expect(result).toEqual({
                ...cachedResult,
                cached: true
            });
            expect(mockHfInference.featureExtraction).not.toHaveBeenCalled();
        });

        it('should cache new embeddings', async () => {
            const mockEmbedding = [0.1, 0.2, 0.3, 0.4];
            mockHfInference.featureExtraction.mockResolvedValue(mockEmbedding);
            mockRedisInstance.get.mockResolvedValue(null);

            await embeddingService.generateEmbedding('test text');

            expect(mockRedisInstance.setex).toHaveBeenCalledWith(
                expect.stringContaining('embedding:huggingface:sentence-transformers/all-MiniLM-L6-v2:'),
                3600,
                expect.stringContaining('"embedding":[0.1,0.2,0.3,0.4]')
            );
        });

        it('should process batch embeddings correctly', async () => {
            const texts = ['text1', 'text2', 'text3'];
            const mockEmbeddings = [
                [0.1, 0.2],
                [0.3, 0.4],
                [0.5, 0.6]
            ];

            mockRedisInstance.get.mockResolvedValue(null);
            mockHfInference.featureExtraction
                .mockResolvedValueOnce(mockEmbeddings[0])
                .mockResolvedValueOnce(mockEmbeddings[1])
                .mockResolvedValueOnce(mockEmbeddings[2]);

            const result = await embeddingService.batchEmbeddings(texts);

            expect(result.totalProcessed).toBe(3);
            expect(result.results).toHaveLength(3);
            expect(result.cacheHits).toBe(0);
            expect(result.results[0]?.embedding).toEqual(mockEmbeddings[0]);
            expect(result.results[1]?.embedding).toEqual(mockEmbeddings[1]);
            expect(result.results[2]?.embedding).toEqual(mockEmbeddings[2]);
        });

        it('should handle batch processing with cache hits', async () => {
            const texts = ['text1', 'text2'];
            const cachedResult = {
                text: 'text1',
                embedding: [0.1, 0.2],
                model: 'sentence-transformers/all-MiniLM-L6-v2',
                timestamp: '2025-07-20T05:35:53.971Z',
                cached: false
            };

            mockRedisInstance.get
                .mockResolvedValueOnce(JSON.stringify(cachedResult))
                .mockResolvedValueOnce(null);
            mockHfInference.featureExtraction.mockResolvedValue([0.3, 0.4]);

            const result = await embeddingService.batchEmbeddings(texts);

            expect(result.totalProcessed).toBe(2);
            expect(result.cacheHits).toBe(1);
            expect(result.results[0]?.cached).toBe(true);
            expect(result.results[1]?.cached).toBe(false);
        });
    });

    describe('OpenAI Provider', () => {
        beforeEach(() => {
            const config: EmbeddingConfig = {
                provider: 'openai',
                model: 'text-embedding-ada-002',
                apiKey: 'test-openai-key',
                timeout: 5000
            };
            embeddingService = new EmbeddingService(config, mockRedisInstance);
        });

        it('should initialize OpenAI client correctly', async () => {
            await embeddingService.initialize();
            expect(require('openai').default).toHaveBeenCalledWith({
                apiKey: 'test-openai-key',
                timeout: 5000
            });
        });

        it('should generate embedding using OpenAI', async () => {
            const mockEmbedding = [0.1, 0.2, 0.3];
            mockOpenAI.embeddings.create.mockResolvedValue({
                data: [{ embedding: mockEmbedding }]
            });
            mockRedisInstance.get.mockResolvedValue(null);

            const result = await embeddingService.generateEmbedding('test text');

            expect(result.embedding).toEqual(mockEmbedding);
            expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
                model: 'text-embedding-ada-002',
                input: 'test text'
            });
        });

        it('should handle batch embeddings with OpenAI', async () => {
            const texts = ['text1', 'text2'];
            const mockEmbeddings = [[0.1, 0.2], [0.3, 0.4]];
            mockOpenAI.embeddings.create.mockResolvedValue({
                data: mockEmbeddings.map(embedding => ({ embedding }))
            });
            mockRedisInstance.get.mockResolvedValue(null);

            const result = await embeddingService.batchEmbeddings(texts);

            expect(result.totalProcessed).toBe(2);
            expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
                model: 'text-embedding-ada-002',
                input: texts
            });
        });
    });

    describe('Local Provider', () => {
        beforeEach(() => {
            const config: EmbeddingConfig = {
                provider: 'local',
                model: 'Xenova/all-MiniLM-L6-v2'
            };
            embeddingService = new EmbeddingService(config, mockRedisInstance);
        });

        it('should initialize local pipeline correctly', async () => {
            await embeddingService.initialize();
            expect(require('@xenova/transformers').pipeline).toHaveBeenCalledWith(
                'feature-extraction',
                'Xenova/all-MiniLM-L6-v2'
            );
        });

        it('should generate embedding using local model', async () => {
            const mockEmbedding = [0.1, 0.2, 0.3];
            mockPipeline.mockResolvedValue(mockEmbedding);
            mockRedisInstance.get.mockResolvedValue(null);

            const result = await embeddingService.generateEmbedding('test text');

            expect(result.embedding).toEqual(mockEmbedding);
            expect(mockPipeline).toHaveBeenCalledWith('test text');
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            const config: EmbeddingConfig = {
                provider: 'huggingface',
                model: 'test-model',
                apiKey: 'test-key'
            };
            embeddingService = new EmbeddingService(config, mockRedisInstance);
        });

        it('should throw TimeoutError on timeout', async () => {
            mockHfInference.featureExtraction.mockRejectedValue(new Error('timeout'));
            mockRedisInstance.get.mockResolvedValue(null);

            await expect(embeddingService.generateEmbedding('test')).rejects.toThrow(TimeoutError);
        });

        it('should throw RateLimitError on rate limit', async () => {
            mockHfInference.featureExtraction.mockRejectedValue(new Error('rate limit'));
            mockRedisInstance.get.mockResolvedValue(null);

            await expect(embeddingService.generateEmbedding('test')).rejects.toThrow(RateLimitError);
        });

        it('should throw DataSourceError on other errors', async () => {
            mockHfInference.featureExtraction.mockRejectedValue(new Error('unknown error'));
            mockRedisInstance.get.mockResolvedValue(null);

            await expect(embeddingService.generateEmbedding('test')).rejects.toThrow(DataSourceError);
        });

        it('should handle cache errors gracefully', async () => {
            const mockEmbedding = [0.1, 0.2, 0.3];
            mockHfInference.featureExtraction.mockResolvedValue(mockEmbedding);
            mockRedisInstance.get.mockRejectedValue(new Error('Redis error'));

            // Should not throw error, just skip cache
            const result = await embeddingService.generateEmbedding('test');
            expect(result.embedding).toEqual(mockEmbedding);
        });
    });

    describe('Cache Management', () => {
        beforeEach(() => {
            const config: EmbeddingConfig = {
                provider: 'huggingface',
                model: 'test-model',
                apiKey: 'test-key',
                cacheEnabled: true,
                cacheTTL: 1800
            };
            embeddingService = new EmbeddingService(config, mockRedisInstance);
        });

        it('should clear cache correctly', async () => {
            const mockKeys = ['embedding:huggingface:test-model:key1', 'embedding:huggingface:test-model:key2'];
            mockRedisInstance.keys.mockResolvedValue(mockKeys);

            await embeddingService.clearCache();

            expect(mockRedisInstance.keys).toHaveBeenCalledWith('embedding:huggingface:test-model:*');
            expect(mockRedisInstance.del).toHaveBeenCalledWith(...mockKeys);
        });

        it('should handle empty cache when clearing', async () => {
            mockRedisInstance.keys.mockResolvedValue([]);

            await embeddingService.clearCache();

            expect(mockRedisInstance.del).not.toHaveBeenCalled();
        });
    });

    describe('Health Check', () => {
        beforeEach(() => {
            const config: EmbeddingConfig = {
                provider: 'huggingface',
                model: 'test-model',
                apiKey: 'test-key'
            };
            embeddingService = new EmbeddingService(config, mockRedisInstance);
        });

        it('should return healthy status when working correctly', async () => {
            const mockEmbedding = [0.1, 0.2, 0.3];
            mockHfInference.featureExtraction.mockResolvedValue(mockEmbedding);
            mockRedisInstance.get.mockResolvedValue(null);

            const health = await embeddingService.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.details).toEqual({
                provider: 'huggingface',
                model: 'test-model',
                embeddingDimension: 3,
                cacheEnabled: true,
                lastCheck: expect.any(String)
            });
        });

        it('should return unhealthy status on error', async () => {
            mockHfInference.featureExtraction.mockRejectedValue(new Error('Service unavailable'));
            mockRedisInstance.get.mockResolvedValue(null);

            const health = await embeddingService.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.details).toEqual({
                provider: 'huggingface',
                model: 'test-model',
                error: expect.stringContaining('Service unavailable'),
                lastCheck: expect.any(String)
            });
        });
    });

    describe('Text Truncation', () => {
        it('should truncate long text based on maxTokens', async () => {
            const config: EmbeddingConfig = {
                provider: 'huggingface',
                model: 'test-model',
                apiKey: 'test-key',
                maxTokens: 2 // Very small for testing
            };
            embeddingService = new EmbeddingService(config, mockRedisInstance);

            const longText = 'This is a very long text that should be truncated';
            const mockEmbedding = [0.1, 0.2];
            mockHfInference.featureExtraction.mockResolvedValue(mockEmbedding);
            mockRedisInstance.get.mockResolvedValue(null);

            await embeddingService.generateEmbedding(longText);

            // Should be called with truncated text (2 tokens * 4 chars = 8 chars)
            expect(mockHfInference.featureExtraction).toHaveBeenCalledWith({
                model: 'test-model',
                inputs: 'This is '
            });
        });
    });

    describe('Configuration', () => {
        it('should return configuration correctly', () => {
            const config: EmbeddingConfig = {
                provider: 'openai',
                model: 'text-embedding-ada-002',
                apiKey: 'test-key',
                batchSize: 16
            };
            embeddingService = new EmbeddingService(config);

            const returnedConfig = embeddingService.getConfig();

            expect(returnedConfig).toEqual({
                provider: 'openai',
                model: 'text-embedding-ada-002',
                apiKey: 'test-key',
                batchSize: 16,
                maxTokens: 512,
                timeout: 30000,
                cacheEnabled: true,
                cacheTTL: 3600
            });
        });
    });
});