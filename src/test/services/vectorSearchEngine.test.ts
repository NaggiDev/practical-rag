import { HybridSearchOptions, SearchOptions, VectorSearchEngine } from '../../services/vectorSearch';
import { DataSourceError } from '../../utils/errors';

// Mock the VectorDatabase and EmbeddingService
const mockVectorDatabase = {
  initialize: jest.fn(),
  searchVectors: jest.fn(),
  healthCheck: jest.fn(),
  getIndexStats: jest.fn()
};

const mockEmbeddingService = {
  generateEmbedding: jest.fn(),
  healthCheck: jest.fn()
};

describe('VectorSearchEngine', () => {
  let vectorSearchEngine: VectorSearchEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    vectorSearchEngine = new VectorSearchEngine(
      mockVectorDatabase as any,
      mockEmbeddingService
    );
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      mockVectorDatabase.initialize.mockResolvedValue(undefined);

      await vectorSearchEngine.initialize();

      expect(mockVectorDatabase.initialize).toHaveBeenCalledTimes(1);
    });

    it('should not initialize twice', async () => {
      mockVectorDatabase.initialize.mockResolvedValue(undefined);

      await vectorSearchEngine.initialize();
      await vectorSearchEngine.initialize();

      expect(mockVectorDatabase.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('Semantic Search', () => {
    beforeEach(() => {
      mockVectorDatabase.initialize.mockResolvedValue(undefined);
    });

    it('should perform semantic search successfully', async () => {
      const query = 'test query';
      const options: SearchOptions = {
        topK: 5,
        includeMetadata: true
      };

      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const mockSearchResults = [
        {
          id: 'doc1',
          score: 0.9,
          metadata: {
            title: 'Test Document 1',
            category: 'test',
            createdAt: new Date().toISOString()
          }
        }
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding
      });
      mockVectorDatabase.searchVectors.mockResolvedValue(mockSearchResults);

      const results = await vectorSearchEngine.semanticSearch(query, options);

      expect(mockEmbeddingService.generateEmbedding).toHaveBeenCalledWith(query);
      expect(mockVectorDatabase.searchVectors).toHaveBeenCalledWith(mockEmbedding, options);
      expect(results).toHaveLength(1);
      expect(results[0]).toHaveProperty('vectorScore', 0.9);
      expect(results[0]).toHaveProperty('finalScore');
      expect(results[0]).toHaveProperty('rankingFactors');
    });

    it('should throw error when embedding service is not configured', async () => {
      const engineWithoutEmbedding = new VectorSearchEngine(mockVectorDatabase as any);
      const query = 'test query';
      const options: SearchOptions = { topK: 5 };

      await expect(engineWithoutEmbedding.semanticSearch(query, options))
        .rejects.toThrow(DataSourceError);
    });

    it('should apply ranking factors correctly', async () => {
      const query = 'test query';
      const options: SearchOptions = { topK: 5 };

      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockSearchResults = [
        {
          id: 'doc1',
          score: 0.8,
          metadata: {
            title: 'Test Query Document',
            category: 'test',
            createdAt: new Date().toISOString()
          }
        }
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding
      });
      mockVectorDatabase.searchVectors.mockResolvedValue(mockSearchResults);

      const results = await vectorSearchEngine.semanticSearch(query, options);

      expect(results[0]?.finalScore).toBeGreaterThan(0.8);
      expect(results[0]?.rankingFactors.metadata).toBeGreaterThan(0);
      expect(results[0]?.rankingFactors.recency).toBeGreaterThan(0);
    });
  });

  describe('Hybrid Search', () => {
    beforeEach(() => {
      mockVectorDatabase.initialize.mockResolvedValue(undefined);
    });

    it('should perform hybrid search successfully', async () => {
      const query = 'machine learning algorithms';
      const options: HybridSearchOptions = {
        topK: 5,
        vectorWeight: 0.7,
        keywordWeight: 0.3,
        includeMetadata: true
      };

      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      const mockSemanticResults = [
        {
          id: 'doc1',
          score: 0.9,
          metadata: {
            title: 'Deep Learning Guide',
            content: 'machine learning neural networks',
            category: 'ai'
          }
        }
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding
      });

      mockVectorDatabase.searchVectors
        .mockResolvedValueOnce(mockSemanticResults)
        .mockResolvedValueOnce(mockSemanticResults);

      const results = await vectorSearchEngine.hybridSearch(query, options);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty('vectorScore');
      expect(results[0]).toHaveProperty('finalScore');
      expect(results[0]?.rankingFactors).toHaveProperty('semantic');
    });

    it('should use default weights when not specified', async () => {
      const query = 'test query';
      const options: HybridSearchOptions = {
        topK: 3
      };

      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = [
        {
          id: 'doc1',
          score: 0.8,
          metadata: { title: 'Test Doc' }
        }
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding
      });
      mockVectorDatabase.searchVectors.mockResolvedValue(mockResults);

      const results = await vectorSearchEngine.hybridSearch(query, options);

      expect(results).toHaveLength(1);
      expect(results[0]?.finalScore).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    beforeEach(() => {
      mockVectorDatabase.initialize.mockResolvedValue(undefined);
    });

    it('should return search statistics', async () => {
      const mockStats = {
        totalVectors: 1000,
        dimension: 384,
        indexType: 'faiss',
        lastUpdated: new Date()
      };

      mockVectorDatabase.getIndexStats.mockResolvedValue(mockStats);

      const stats = await vectorSearchEngine.getSearchStats();

      expect(stats).toEqual({
        totalVectors: 1000,
        averageResponseTime: 0,
        cacheHitRate: 0,
        lastOptimized: mockStats.lastUpdated
      });
    });

    it('should measure search performance', async () => {
      const query = 'performance test';
      const options: SearchOptions = { topK: 10 };

      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = Array.from({ length: 10 }, (_, i) => ({
        id: `doc${i}`,
        score: 0.9 - (i * 0.05),
        metadata: { title: `Document ${i}` }
      }));

      mockEmbeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding
      });
      mockVectorDatabase.searchVectors.mockResolvedValue(mockResults);

      const startTime = Date.now();
      const results = await vectorSearchEngine.semanticSearch(query, options);
      const endTime = Date.now();

      expect(results).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(1000);
    });
  });

  describe('Health Check', () => {
    it('should return healthy status when all components are working', async () => {
      mockVectorDatabase.healthCheck.mockResolvedValue({
        status: 'healthy',
        details: { provider: 'faiss' }
      });
      mockEmbeddingService.healthCheck.mockResolvedValue({
        status: 'healthy',
        details: { model: 'sentence-transformers' }
      });

      const health = await vectorSearchEngine.healthCheck();

      expect(health.status).toBe('healthy');
      expect(health.details).toHaveProperty('vectorDatabase');
      expect(health.details).toHaveProperty('embeddingService');
      expect(health.details).toHaveProperty('lastCheck');
    });

    it('should return unhealthy status when vector database is down', async () => {
      mockVectorDatabase.healthCheck.mockResolvedValue({
        status: 'unhealthy',
        details: { error: 'Connection failed' }
      });
      mockEmbeddingService.healthCheck.mockResolvedValue({
        status: 'healthy',
        details: { model: 'sentence-transformers' }
      });

      const health = await vectorSearchEngine.healthCheck();

      expect(health.status).toBe('unhealthy');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    beforeEach(() => {
      mockVectorDatabase.initialize.mockResolvedValue(undefined);
    });

    it('should handle empty search results', async () => {
      const query = 'nonexistent query';
      const options: SearchOptions = { topK: 5 };

      mockEmbeddingService.generateEmbedding.mockResolvedValue({
        embedding: [0.1, 0.2, 0.3]
      });
      mockVectorDatabase.searchVectors.mockResolvedValue([]);

      const results = await vectorSearchEngine.semanticSearch(query, options);

      expect(results).toHaveLength(0);
    });

    it('should handle malformed metadata gracefully', async () => {
      const query = 'test query';
      const options: SearchOptions = { topK: 5 };

      const mockEmbedding = [0.1, 0.2, 0.3];
      const mockResults = [
        {
          id: 'doc1',
          score: 0.8,
          metadata: {}
        }
      ];

      mockEmbeddingService.generateEmbedding.mockResolvedValue({
        embedding: mockEmbedding
      });
      mockVectorDatabase.searchVectors.mockResolvedValue(mockResults);

      const results = await vectorSearchEngine.semanticSearch(query, options);

      expect(results).toHaveLength(1);
      expect(results[0]?.finalScore).toBeDefined();
    });
  });
});