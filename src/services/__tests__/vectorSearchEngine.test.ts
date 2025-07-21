import { DataSourceError } from '../../utils/errors';
import { HybridSearchOptions, VectorSearchEngine } from '../vectorSearch';

// Mock dependencies
const mockVectorDb = {
    initialize: jest.fn(),
    searchVectors: jest.fn(),
    getIndexStats: jest.fn(),
    healthCheck: jest.fn()
};

const mockEmbeddingService = {
    generateEmbedding: jest.fn(),
    healthCheck: jest.fn()
};

describe('VectorSearchEngine', () => {
    let searchEngine: VectorSearchEngine;

    beforeEach(() => {
        jest.clearAllMocks();
        searchEngine = new VectorSearchEngine(mockVectorDb as any, mockEmbeddingService);
    });

    describe('initialization', () => {
        it('should initialize vector database', async () => {
            await searchEngine.initialize();
            expect(mockVectorDb.initialize).toHaveBeenCalledTimes(1);
        });

        it('should not reinitialize if already initialized', async () => {
            await searchEngine.initialize();
            await searchEngine.initialize();
            expect(mockVectorDb.initialize).toHaveBeenCalledTimes(1);
        });
    });

    describe('semanticSearch', () => {
        const mockQuery = 'test query';
        const mockOptions = { topK: 5, includeMetadata: true };
        const mockEmbedding = [0.1, 0.2, 0.3];
        const mockVectorResults = [
            {
                id: '1',
                score: 0.9,
                metadata: { title: 'Test Document 1', category: 'tech' }
            },
            {
                id: '2',
                score: 0.8,
                metadata: { title: 'Test Document 2', category: 'science' }
            }
        ];

        beforeEach(() => {
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: mockEmbedding,
                text: mockQuery,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });
            mockVectorDb.searchVectors.mockResolvedValue(mockVectorResults);
        });

        it('should perform semantic search successfully', async () => {
            const results = await searchEngine.semanticSearch(mockQuery, mockOptions);

            expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(mockQuery);
            expect(mockVectorDb.searchVectors).toHaveBeenCalledWith(mockEmbedding, mockOptions);
            expect(results).toHaveLength(2);
            expect(results[0]).toMatchObject({
                id: '1',
                vectorScore: 0.9,
                finalScore: expect.any(Number),
                rankingFactors: expect.objectContaining({
                    semantic: expect.any(Number)
                })
            });
        });

        it('should throw error when embedding service is not configured', async () => {
            const engineWithoutEmbedding = new VectorSearchEngine(mockVectorDb as any);

            await expect(engineWithoutEmbedding.semanticSearch(mockQuery, mockOptions))
                .rejects.toThrow(DataSourceError);
        });

        it('should apply ranking factors correctly', async () => {
            const results = await searchEngine.semanticSearch(mockQuery, mockOptions);

            // Check that ranking factors are applied
            expect(results[0]!.rankingFactors).toHaveProperty('semantic');
            expect(results[0]!.rankingFactors).toHaveProperty('metadata');
            expect(results[0]!.rankingFactors).toHaveProperty('recency');
        });

        it('should handle embedding service errors', async () => {
            mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding failed'));

            await expect(searchEngine.semanticSearch(mockQuery, mockOptions))
                .rejects.toThrow(DataSourceError);
        });
    });

    describe('hybridSearch', () => {
        const mockQuery = 'artificial intelligence';
        const mockOptions: HybridSearchOptions = {
            topK: 5,
            includeMetadata: true,
            vectorWeight: 0.7,
            keywordWeight: 0.3,
            keywordBoost: { 'artificial': 2.0, 'intelligence': 1.5 }
        };

        beforeEach(() => {
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: mockQuery,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            // Mock vector search results
            mockVectorDb.searchVectors.mockImplementation((vector, searchOptions) => {
                if (vector.every((v: number) => v === 0)) {
                    // Keyword search simulation - return more results for filtering
                    const results = [
                        {
                            id: '3',
                            score: 0.7,
                            metadata: { title: 'AI Research Paper', content: 'artificial intelligence machine learning' }
                        },
                        {
                            id: '4',
                            score: 0.6,
                            metadata: { title: 'Tech Article', content: 'technology trends artificial' }
                        }
                    ];
                    return Promise.resolve(results.slice(0, searchOptions.topK));
                } else {
                    // Semantic search
                    const results = [
                        {
                            id: '1',
                            score: 0.9,
                            metadata: { title: 'AI Overview', content: 'comprehensive guide to AI' }
                        },
                        {
                            id: '2',
                            score: 0.8,
                            metadata: { title: 'ML Basics', content: 'machine learning fundamentals' }
                        }
                    ];
                    return Promise.resolve(results.slice(0, searchOptions.topK));
                }
            });
        });

        it('should perform hybrid search successfully', async () => {
            const results = await searchEngine.hybridSearch(mockQuery, mockOptions);

            expect(results).toHaveLength(4); // Combined results
            expect(results[0]).toHaveProperty('vectorScore');
            expect(results[0]).toHaveProperty('finalScore');
            expect(results[0]!.rankingFactors).toHaveProperty('semantic');
        });

        it('should combine vector and keyword scores correctly', async () => {
            const results = await searchEngine.hybridSearch(mockQuery, mockOptions);

            // Check that final scores are combinations of vector and keyword scores
            const hasVectorAndKeyword = results.some(r =>
                r.rankingFactors.semantic > 0 && r.rankingFactors.keyword && r.rankingFactors.keyword > 0
            );
            expect(hasVectorAndKeyword).toBe(true);
        });

        it('should apply keyword boosting', async () => {
            const results = await searchEngine.hybridSearch(mockQuery, mockOptions);

            // Results should be influenced by keyword boosting
            expect(results.length).toBeGreaterThan(0);
            expect(results[0]!.finalScore).toBeGreaterThan(0);
        });

        it('should rerank results when requested', async () => {
            const optionsWithRerank = { ...mockOptions, rerankResults: true };
            const results = await searchEngine.hybridSearch(mockQuery, optionsWithRerank);

            expect(results).toHaveLength(mockOptions.topK);
            expect(results[0]!.finalScore).toBeGreaterThanOrEqual(results[1]!.finalScore);
        });
    });

    describe('keyword extraction and scoring', () => {
        it('should extract keywords correctly', async () => {
            const query = 'machine learning algorithms for data science';

            // Test through hybrid search which uses keyword extraction
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: query,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockVectorDb.searchVectors.mockResolvedValue([
                {
                    id: '1',
                    score: 0.9,
                    metadata: { title: 'ML Guide', content: 'machine learning data science algorithms' }
                }
            ]);

            const results = await searchEngine.hybridSearch(query, { topK: 5 });
            expect(results.length).toBeGreaterThan(0);
        });

        it('should filter stop words', async () => {
            const query = 'the best machine learning and data science';

            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: query,
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockVectorDb.searchVectors.mockResolvedValue([
                {
                    id: '1',
                    score: 0.9,
                    metadata: { title: 'ML Guide', content: 'machine learning data science' }
                }
            ]);

            const results = await searchEngine.hybridSearch(query, { topK: 5 });
            expect(results.length).toBeGreaterThan(0);
        });
    });

    describe('ranking factors', () => {
        beforeEach(() => {
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: 'test query',
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });
        });

        it('should apply metadata boost for title matches', async () => {
            mockVectorDb.searchVectors.mockResolvedValue([
                {
                    id: '1',
                    score: 0.8,
                    metadata: { title: 'Test Query Results', category: 'tech' }
                }
            ]);

            const results = await searchEngine.semanticSearch('test query', { topK: 5 });
            expect(results[0]!.rankingFactors.metadata).toBeGreaterThan(0);
        });

        it('should apply recency boost for recent content', async () => {
            const recentDate = new Date();
            recentDate.setDate(recentDate.getDate() - 5); // 5 days ago

            mockVectorDb.searchVectors.mockResolvedValue([
                {
                    id: '1',
                    score: 0.8,
                    metadata: {
                        title: 'Recent Document',
                        createdAt: recentDate.toISOString()
                    }
                }
            ]);

            const results = await searchEngine.semanticSearch('test query', { topK: 5 });
            expect(results[0]!.rankingFactors.recency).toBeGreaterThan(0);
        });

        it('should not boost old content', async () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

            mockVectorDb.searchVectors.mockResolvedValue([
                {
                    id: '1',
                    score: 0.8,
                    metadata: {
                        title: 'Old Document',
                        createdAt: oldDate.toISOString()
                    }
                }
            ]);

            const results = await searchEngine.semanticSearch('test query', { topK: 5 });
            expect(results[0]!.rankingFactors.recency).toBe(0);
        });
    });

    describe('result diversity', () => {
        it('should promote diverse results in reranking', async () => {
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: 'test query',
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockVectorDb.searchVectors.mockResolvedValue([
                {
                    id: '1',
                    score: 0.9,
                    metadata: { sourceId: 'source1', category: 'tech' }
                },
                {
                    id: '2',
                    score: 0.85,
                    metadata: { sourceId: 'source1', category: 'tech' } // Same source and category
                },
                {
                    id: '3',
                    score: 0.8,
                    metadata: { sourceId: 'source2', category: 'science' } // Different source and category
                }
            ]);

            const results = await searchEngine.hybridSearch('test query', {
                topK: 3,
                rerankResults: true
            });

            // Should prefer diverse results
            expect(results).toHaveLength(3);
            expect(results[0]!.id).toBe('1'); // Highest score
            expect(results[1]!.id).toBe('3'); // Diverse result preferred over similar one
        });
    });

    describe('error handling', () => {
        it('should handle vector database errors', async () => {
            mockVectorDb.searchVectors.mockRejectedValue(new Error('Vector DB error'));
            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: 'test',
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            await expect(searchEngine.semanticSearch('test', { topK: 5 }))
                .rejects.toThrow(DataSourceError);
        });

        it('should handle hybrid search errors gracefully', async () => {
            mockEmbeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding error'));

            await expect(searchEngine.hybridSearch('test', { topK: 5 }))
                .rejects.toThrow(DataSourceError);
        });
    });

    describe('health check', () => {
        it('should return healthy status when all services are healthy', async () => {
            mockVectorDb.healthCheck.mockResolvedValue({
                status: 'healthy',
                details: { provider: 'faiss' }
            });
            mockEmbeddingService.healthCheck.mockResolvedValue({
                status: 'healthy',
                details: { provider: 'openai' }
            });

            const health = await searchEngine.healthCheck();
            expect(health.status).toBe('healthy');
            expect(health.details).toHaveProperty('vectorDatabase');
            expect(health.details).toHaveProperty('embeddingService');
        });

        it('should return unhealthy status when vector database is unhealthy', async () => {
            mockVectorDb.healthCheck.mockResolvedValue({
                status: 'unhealthy',
                details: { error: 'Connection failed' }
            });
            mockEmbeddingService.healthCheck.mockResolvedValue({
                status: 'healthy',
                details: { provider: 'openai' }
            });

            const health = await searchEngine.healthCheck();
            expect(health.status).toBe('unhealthy');
        });

        it('should handle health check errors', async () => {
            mockVectorDb.healthCheck.mockRejectedValue(new Error('Health check failed'));

            const health = await searchEngine.healthCheck();
            expect(health.status).toBe('unhealthy');
            expect(health.details).toHaveProperty('error');
        });
    });

    describe('search statistics', () => {
        it('should return search statistics', async () => {
            mockVectorDb.getIndexStats.mockResolvedValue({
                totalVectors: 1000,
                dimension: 384,
                indexType: 'flat',
                lastUpdated: new Date()
            });

            const stats = await searchEngine.getSearchStats();
            expect(stats).toHaveProperty('totalVectors', 1000);
            expect(stats).toHaveProperty('averageResponseTime');
            expect(stats).toHaveProperty('cacheHitRate');
            expect(stats).toHaveProperty('lastOptimized');
        });
    });

    describe('performance considerations', () => {
        it('should handle large result sets efficiently', async () => {
            const largeResultSet = Array.from({ length: 1000 }, (_, i) => ({
                id: `doc-${i}`,
                score: Math.random(),
                metadata: { title: `Document ${i}`, category: `cat-${i % 10}` }
            }));

            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: 'test query',
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockVectorDb.searchVectors.mockResolvedValue(largeResultSet);

            const startTime = Date.now();
            const results = await searchEngine.semanticSearch('test query', { topK: 10 });
            const endTime = Date.now();

            expect(results).toHaveLength(10);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        it('should limit results to requested topK', async () => {
            const manyResults = Array.from({ length: 100 }, (_, i) => ({
                id: `doc-${i}`,
                score: 0.9 - (i * 0.01),
                metadata: { title: `Document ${i}` }
            }));

            mockEmbeddingService.generateEmbedding.mockResolvedValue({
                embedding: [0.1, 0.2, 0.3],
                text: 'test query',
                model: 'test-model',
                timestamp: new Date(),
                cached: false
            });

            mockVectorDb.searchVectors.mockResolvedValue(manyResults);

            const results = await searchEngine.hybridSearch('test query', { topK: 5 });
            expect(results).toHaveLength(5);
        });
    });
});