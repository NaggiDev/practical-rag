import Redis from 'ioredis';
import { Content, ContentChange } from '../../models/content';
import { IndexingConfig, IndexingService } from '../../services/indexing';

// Mock dependencies
jest.mock('../../services/embedding');
jest.mock('ioredis');

const mockEmbeddingService = {
    generateEmbedding: jest.fn(),
    batchEmbeddings: jest.fn(),
    healthCheck: jest.fn()
};

const mockRedis = {
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn()
};

describe('IndexingService', () => {
    let indexingService: IndexingService;
    let mockRedisInstance: jest.Mocked<Redis>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockRedisInstance = mockRedis as any;

        const config: Partial<IndexingConfig> = {
            chunkSize: 500,
            chunkOverlap: 100,
            minChunkSize: 50,
            maxChunkSize: 1000,
            enableMetadataExtraction: true,
            batchSize: 5,
            concurrency: 2
        };

        indexingService = new IndexingService(
            config,
            mockEmbeddingService as any,
            mockRedisInstance
        );
    });

    describe('Content Indexing', () => {
        const sampleContent: Content = {
            id: '550e8400-e29b-41d4-a716-446655440000',
            sourceId: 'source-1',
            title: 'Test Document',
            text: 'This is a test document. It contains multiple sentences. Each sentence should be processed correctly. The indexing service should chunk this text appropriately.',
            metadata: {
                fileType: 'txt',
                author: 'Test Author'
            },
            embedding: [0.1, 0.2, 0.3], // Valid embedding
            chunks: [],
            lastUpdated: new Date(),
            version: 1
        };

        it('should index content successfully with sliding window strategy', async () => {
            // Mock content change detection
            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            // Mock embedding generation
            const mockEmbedding = [0.1, 0.2, 0.3];
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: sampleContent.text,
                embedding: mockEmbedding,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [
                    {
                        text: 'chunk1',
                        embedding: [0.1, 0.2],
                        model: 'test-model',
                        timestamp: new Date(),
                        cached: false
                    }
                ],
                totalProcessed: 1,
                processingTime: 100,
                cacheHits: 0
            });

            const result = await indexingService.indexContent(sampleContent, 'sliding-window');

            expect(result.status).toBe('success');
            expect(result.contentId).toBe('550e8400-e29b-41d4-a716-446655440000');
            expect(result.chunksCreated).toBeGreaterThan(0);
            expect(result.embeddingsGenerated).toBeGreaterThan(0);
            expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalled();
            expect(mockEmbeddingService.batchEmbeddings).toHaveBeenCalled();
        });

        it('should index content with sentence-based strategy', async () => {
            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            const mockEmbedding = [0.1, 0.2, 0.3];
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: sampleContent.text,
                embedding: mockEmbedding,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [
                    {
                        text: 'This is a test document.',
                        embedding: [0.1, 0.2],
                        model: 'test-model',
                        timestamp: new Date(),
                        cached: false
                    },
                    {
                        text: 'It contains multiple sentences.',
                        embedding: [0.3, 0.4],
                        model: 'test-model',
                        timestamp: new Date(),
                        cached: false
                    }
                ],
                totalProcessed: 2,
                processingTime: 150,
                cacheHits: 0
            });

            const result = await indexingService.indexContent(sampleContent, 'sentence-based');

            expect(result.status).toBe('success');
            expect(result.chunksCreated).toBeGreaterThan(0);
        });

        it('should skip indexing if content has not changed', async () => {
            // Mock that content hash exists and matches current content
            // We need to calculate the actual hash that would be generated
            let hash = 0;
            const text = sampleContent.text;
            for (let i = 0; i < text.length; i++) {
                const char = text.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash;
            }
            const expectedHash = Math.abs(hash).toString(36);

            mockRedisInstance.get.mockResolvedValue(expectedHash);

            const result = await indexingService.indexContent(sampleContent);

            expect(result.status).toBe('success');
            expect(result.embeddingsGenerated).toBe(0);
            expect(mockEmbeddingService.generateEmbedding).not.toHaveBeenCalled();
        });

        it('should handle unknown chunking strategy', async () => {
            mockRedisInstance.get.mockResolvedValue(null);

            const result = await indexingService.indexContent(sampleContent, 'unknown-strategy');

            expect(result.status).toBe('failed');
            expect(result.errors).toContain('Unknown chunking strategy: unknown-strategy');
        });

        it('should extract metadata when enabled', async () => {
            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            const mockEmbedding = [0.1, 0.2, 0.3];
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: sampleContent.text,
                embedding: mockEmbedding,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [{
                    text: 'chunk',
                    embedding: [0.1, 0.2],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                }],
                totalProcessed: 1,
                processingTime: 100,
                cacheHits: 0
            });

            const result = await indexingService.indexContent(sampleContent);

            expect(result.status).toBe('success');
            // Metadata extraction should have been performed
            expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalled();
        });
    });

    describe('Batch Indexing', () => {
        const sampleContents: Content[] = [
            {
                id: '550e8400-e29b-41d4-a716-446655440001',
                sourceId: 'source-1',
                title: 'Document 1',
                text: 'First document content.',
                metadata: {},
                embedding: [0.1, 0.2, 0.3],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            },
            {
                id: '550e8400-e29b-41d4-a716-446655440002',
                sourceId: 'source-1',
                title: 'Document 2',
                text: 'Second document content.',
                metadata: {},
                embedding: [0.4, 0.5, 0.6],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            }
        ];

        it('should process batch of contents successfully', async () => {
            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            const mockEmbedding = [0.1, 0.2, 0.3];
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: 'test',
                embedding: mockEmbedding,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [{
                    text: 'chunk',
                    embedding: [0.1, 0.2],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                }],
                totalProcessed: 1,
                processingTime: 100,
                cacheHits: 0
            });

            const result = await indexingService.batchIndexContent(sampleContents);

            expect(result.totalProcessed).toBe(2);
            expect(result.successful).toBe(2);
            expect(result.failed).toBe(0);
            expect(result.results).toHaveLength(2);
        });

        it('should handle partial failures in batch processing', async () => {
            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            // First call succeeds, second fails
            mockEmbeddingService.generateEmbedding
                .mockResolvedValueOnce({
                    text: 'test',
                    embedding: [0.1, 0.2, 0.3],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                })
                .mockRejectedValueOnce(new Error('Embedding failed'));

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [{
                    text: 'chunk',
                    embedding: [0.1, 0.2],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                }],
                totalProcessed: 1,
                processingTime: 100,
                cacheHits: 0
            });

            const result = await indexingService.batchIndexContent(sampleContents);

            expect(result.totalProcessed).toBe(2);
            expect(result.successful).toBe(1);
            expect(result.failed).toBe(1);
        });
    });

    describe('Index Updates', () => {
        const sampleChanges: ContentChange[] = [
            {
                contentId: 'content-1',
                changeType: 'created',
                timestamp: new Date(),
                newVersion: 1
            },
            {
                contentId: 'content-2',
                changeType: 'updated',
                timestamp: new Date(),
                previousVersion: 1,
                newVersion: 2
            },
            {
                contentId: 'content-3',
                changeType: 'deleted',
                timestamp: new Date(),
                previousVersion: 1
            }
        ];

        it('should process content changes correctly', async () => {
            mockRedisInstance.setex.mockResolvedValue('OK');
            mockRedisInstance.keys.mockResolvedValue(['key1', 'key2']);
            mockRedisInstance.del.mockResolvedValue(2);

            const result = await indexingService.updateIndex('source-1', sampleChanges);

            expect(result.totalProcessed).toBe(3);
            expect(result.successful).toBe(3);
            expect(result.failed).toBe(0);
        });

        it('should handle errors during index updates', async () => {
            mockRedisInstance.setex.mockResolvedValue('OK');
            mockRedisInstance.keys.mockRejectedValue(new Error('Redis error'));

            const result = await indexingService.updateIndex('source-1', [sampleChanges[2]!]);

            expect(result.totalProcessed).toBe(1);
            expect(result.successful).toBe(0);
            expect(result.failed).toBe(1);
        });
    });

    describe('Chunking Strategies', () => {
        it('should provide available chunking strategies', () => {
            const strategies = indexingService.getAvailableStrategies();

            expect(strategies).toContain('sliding-window');
            expect(strategies).toContain('sentence-based');
            expect(strategies.length).toBeGreaterThanOrEqual(2);
        });

        it('should chunk text with sliding window strategy', async () => {
            const longText = 'A'.repeat(1000) + ' ' + 'B'.repeat(1000);
            const content: Content = {
                id: '550e8400-e29b-41d4-a716-446655440003',
                sourceId: 'test',
                title: 'Test',
                text: longText,
                metadata: {},
                embedding: [0.1, 0.2, 0.3],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            };

            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: longText,
                embedding: [0.1, 0.2, 0.3],
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            // Mock enough embeddings for all chunks that will be created
            const mockResults = [];
            for (let i = 0; i < 10; i++) { // Create enough mock results
                mockResults.push({
                    text: `chunk${i}`,
                    embedding: [0.1 + i * 0.1, 0.2 + i * 0.1],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                });
            }

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: mockResults,
                totalProcessed: mockResults.length,
                processingTime: 100,
                cacheHits: 0
            });

            const result = await indexingService.indexContent(content, 'sliding-window');

            expect(result.status).toBe('success');
            expect(result.chunksCreated).toBeGreaterThan(1);
        });
    });

    describe('Metadata Extraction', () => {
        it('should extract basic text statistics', async () => {
            const content: Content = {
                id: '550e8400-e29b-41d4-a716-446655440004',
                sourceId: 'test',
                title: 'Test',
                text: 'This is a test. It has two sentences! And some numbers like 123.',
                metadata: {},
                embedding: [0.1, 0.2, 0.3],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            };

            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: content.text,
                embedding: [0.1, 0.2, 0.3],
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [{
                    text: content.text,
                    embedding: [0.1, 0.2],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                }],
                totalProcessed: 1,
                processingTime: 100,
                cacheHits: 0
            });

            const result = await indexingService.indexContent(content);

            expect(result.status).toBe('success');
            // Metadata should have been extracted and stored
            expect(mockRedisInstance.setex).toHaveBeenCalled();
        });

        it('should extract entities from text', async () => {
            const content: Content = {
                id: '550e8400-e29b-41d4-a716-446655440005',
                sourceId: 'test',
                title: 'Test',
                text: 'Contact us at test@example.com or visit https://example.com. Meeting on 2023-12-25.',
                metadata: {},
                embedding: [0.1, 0.2, 0.3],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            };

            mockRedisInstance.get.mockResolvedValue(null);
            mockRedisInstance.set.mockResolvedValue('OK');
            mockRedisInstance.setex.mockResolvedValue('OK');

            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: content.text,
                embedding: [0.1, 0.2, 0.3],
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [{
                    text: content.text,
                    embedding: [0.1, 0.2],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                }],
                totalProcessed: 1,
                processingTime: 100,
                cacheHits: 0
            });

            const result = await indexingService.indexContent(content);

            expect(result.status).toBe('success');
        });
    });

    describe('Configuration and Health', () => {
        it('should return configuration correctly', () => {
            const config = indexingService.getConfig();

            expect(config).toEqual({
                chunkSize: 500,
                chunkOverlap: 100,
                minChunkSize: 50,
                maxChunkSize: 1000,
                enableMetadataExtraction: true,
                batchSize: 5,
                concurrency: 2
            });
        });

        it('should return healthy status when embedding service is healthy', async () => {
            mockEmbeddingService.healthCheck.mockResolvedValue({
                status: 'healthy',
                details: { provider: 'test' }
            });

            const health = await indexingService.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.details).toHaveProperty('service', 'IndexingService');
            expect(health.details).toHaveProperty('availableStrategies');
        });

        it('should return unhealthy status when embedding service is unhealthy', async () => {
            mockEmbeddingService.healthCheck.mockResolvedValue({
                status: 'unhealthy',
                details: { error: 'Service down' }
            });

            const health = await indexingService.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.details).toHaveProperty('embeddingService');
        });

        it('should handle health check errors', async () => {
            mockEmbeddingService.healthCheck.mockRejectedValue(new Error('Health check failed'));

            const health = await indexingService.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.details).toHaveProperty('error');
        });
    });

    describe('Cache Operations', () => {
        it('should handle cache failures gracefully', async () => {
            // Mock cache failures
            mockRedisInstance.get.mockRejectedValue(new Error('Cache error'));
            mockRedisInstance.set.mockRejectedValue(new Error('Cache error'));
            mockRedisInstance.setex.mockRejectedValue(new Error('Cache error'));

            const content: Content = {
                id: '550e8400-e29b-41d4-a716-446655440006',
                sourceId: 'test',
                title: 'Test',
                text: 'Test content',
                metadata: {},
                embedding: [0.1, 0.2, 0.3],
                chunks: [],
                lastUpdated: new Date(),
                version: 1
            };

            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                text: content.text,
                embedding: [0.1, 0.2, 0.3],
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockEmbeddingService.batchEmbeddings.mockResolvedValue({
                results: [{
                    text: content.text,
                    embedding: [0.1, 0.2],
                    model: 'test-model',
                    timestamp: new Date(),
                    cached: false
                }],
                totalProcessed: 1,
                processingTime: 100,
                cacheHits: 0
            });

            // Should still succeed despite cache failures
            const result = await indexingService.indexContent(content);

            expect(result.status).toBe('success');
        });
    });
});