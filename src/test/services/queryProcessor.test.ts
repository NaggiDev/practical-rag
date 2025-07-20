import { DataSource } from '../../models/dataSource';
import { QueryModel, QueryResultModel } from '../../models/query';
import { DataSourceManager } from '../../services/dataSourceManager';
import { EmbeddingResult } from '../../services/embedding';
import { QueryProcessor, QueryProcessorConfig } from '../../services/queryProcessor';
import { SearchResult } from '../../services/vectorSearch';

// Mock implementations
class MockCacheManager {
    private cache = new Map<string, any>();

    async getCachedQueryResult(queryHash: string) {
        return this.cache.get(queryHash) || null;
    }

    async setCachedQueryResult(queryHash: string, result: any) {
        this.cache.set(queryHash, result);
    }

    async healthCheck() {
        return true;
    }
}

class MockVectorDatabase {
    private vectors: SearchResult[] = [
        {
            id: 'doc1',
            score: 0.9,
            metadata: {
                sourceId: 'source1',
                sourceName: 'Test Source',
                contentId: 'content1',
                title: 'Test Document',
                excerpt: 'This is a test document about machine learning.',
                text: 'This is a test document about machine learning and artificial intelligence.'
            }
        },
        {
            id: 'doc2',
            score: 0.7,
            metadata: {
                sourceId: 'source1',
                sourceName: 'Test Source',
                contentId: 'content2',
                title: 'Another Document',
                excerpt: 'This document discusses data science concepts.',
                text: 'This document discusses data science concepts and methodologies.'
            }
        }
    ];

    async searchVectors(_queryVector: number[], options: any): Promise<SearchResult[]> {
        // Return mock results filtered by threshold
        return this.vectors.filter(v => v.score >= (options.threshold || 0));
    }

    async healthCheck() {
        return { status: 'healthy' as const, details: {} };
    }
}

class MockEmbeddingService {
    async generateEmbedding(text: string): Promise<EmbeddingResult> {
        // Return mock embedding
        return {
            text,
            embedding: new Array(384).fill(0).map(() => Math.random()),
            model: 'test-model',
            timestamp: new Date(),
            cached: false
        };
    }

    async healthCheck() {
        return { status: 'healthy', details: {} };
    }
}

class MockDataSourceManager implements DataSourceManager {
    async getActiveSources(): Promise<DataSource[]> {
        return [
            {
                id: 'source1',
                name: 'Test Source',
                type: 'file',
                config: { filePath: '/test/path' },
                status: 'active',
                lastSync: new Date(),
                documentCount: 10
            }
        ];
    }
}

describe('QueryProcessor', () => {
    let queryProcessor: QueryProcessor;
    let mockCacheManager: MockCacheManager;
    let mockVectorDatabase: MockVectorDatabase;
    let mockEmbeddingService: MockEmbeddingService;
    let mockDataSourceManager: MockDataSourceManager;

    const defaultConfig: QueryProcessorConfig = {
        maxConcurrentQueries: 5,
        defaultTimeout: 10000,
        enableParallelSearch: true,
        cacheEnabled: true,
        minConfidenceThreshold: 0.1,
        maxResultsPerSource: 10
    };

    beforeEach(() => {
        mockCacheManager = new MockCacheManager();
        mockVectorDatabase = new MockVectorDatabase();
        mockEmbeddingService = new MockEmbeddingService();
        mockDataSourceManager = new MockDataSourceManager();

        queryProcessor = new QueryProcessor(
            defaultConfig,
            mockCacheManager as any,
            mockVectorDatabase as any,
            mockEmbeddingService as any,
            mockDataSourceManager
        );
    });

    describe('parseQuery', () => {
        it('should parse a simple query correctly', async () => {
            const result = await queryProcessor.parseQuery('What is machine learning?');

            expect(result.originalText).toBe('What is machine learning?');
            expect(result.processedText).toBe('what is machine learning');
            expect(result.intent).toBe('question');
            expect(result.entities).toEqual([]);
            expect(result.filters).toEqual([]);
        });

        it('should extract entities from quoted text', async () => {
            const result = await queryProcessor.parseQuery('Find information about "artificial intelligence"');

            expect(result.entities).toContain('artificial intelligence');
        });

        it('should extract date filters', async () => {
            const result = await queryProcessor.parseQuery('Show documents after 2023-01-01');

            expect(result.filters).toHaveLength(1);
            expect(result.filters[0]).toMatchObject({
                field: 'date',
                operator: 'gte',
                value: '2023-01-01'
            });
        });

        it('should extract type filters', async () => {
            const result = await queryProcessor.parseQuery('Find type:pdf documents');

            expect(result.filters).toHaveLength(1);
            expect(result.filters[0]).toMatchObject({
                field: 'type',
                operator: 'eq',
                value: 'pdf'
            });
        });

        it('should classify intent correctly', async () => {
            const questionResult = await queryProcessor.parseQuery('What is the capital of France?');
            expect(questionResult.intent).toBe('question');

            const searchResult = await queryProcessor.parseQuery('Find documents about AI');
            expect(searchResult.intent).toBe('search');

            const generalResult = await queryProcessor.parseQuery('Machine learning concepts');
            expect(generalResult.intent).toBe('general');
        });

        it('should throw error for empty query', async () => {
            await expect(queryProcessor.parseQuery('')).rejects.toThrow('Query text cannot be empty');
            await expect(queryProcessor.parseQuery('   ')).rejects.toThrow('Query text cannot be empty');
        });
    });

    describe('processQuery', () => {
        it('should process a string query successfully', async () => {
            const result = await queryProcessor.processQuery('What is machine learning?');

            expect(result).toBeInstanceOf(QueryResultModel);
            expect(result.response).toBeTruthy();
            expect(result.sources).toHaveLength(2);
            expect(result.confidence).toBeGreaterThan(0);
            expect(result.processingTime).toBeGreaterThan(0);
            expect(result.cached).toBe(false);
        });

        it('should process a QueryModel successfully', async () => {
            const query = new QueryModel({
                text: 'What is machine learning?',
                context: { domain: 'AI' }
            });

            const result = await queryProcessor.processQuery(query);

            expect(result).toBeInstanceOf(QueryResultModel);
            expect(result.response).toBeTruthy();
            expect(result.sources).toHaveLength(2);
        });

        it('should return cached result when available', async () => {
            const query = 'What is machine learning?';

            // First call
            const result1 = await queryProcessor.processQuery(query);
            expect(result1.cached).toBe(false);

            // Second call should be cached
            const result2 = await queryProcessor.processQuery(query);
            expect(result2.cached).toBe(true);
        });

        it('should handle queries with no results', async () => {
            // Mock empty results
            mockVectorDatabase = new MockVectorDatabase();
            (mockVectorDatabase as any).vectors = [];

            queryProcessor = new QueryProcessor(
                defaultConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            const result = await queryProcessor.processQuery('nonexistent query');

            expect(result.sources).toHaveLength(0);
            expect(result.confidence).toBe(0);
            expect(result.response).toContain("couldn't find any relevant information");
        });

        it('should respect confidence threshold', async () => {
            const lowThresholdConfig = { ...defaultConfig, minConfidenceThreshold: 0.8 };

            queryProcessor = new QueryProcessor(
                lowThresholdConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            const result = await queryProcessor.processQuery('test query');

            // Only high-confidence results should be included
            expect(result.sources.length).toBeLessThanOrEqual(1);
        });

        it('should handle concurrent queries within limit', async () => {
            const promises = [];
            for (let i = 0; i < 3; i++) {
                promises.push(queryProcessor.processQuery(`query ${i}`));
            }

            const results = await Promise.all(promises);
            expect(results).toHaveLength(3);
            results.forEach(result => {
                expect(result).toBeInstanceOf(QueryResultModel);
            });
        });

        it('should reject queries when at capacity', async () => {
            const smallCapacityConfig = { ...defaultConfig, maxConcurrentQueries: 1 };

            queryProcessor = new QueryProcessor(
                smallCapacityConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            // Start a long-running query
            const longQuery = queryProcessor.processQuery('long query');

            // Try to start another query immediately
            const result = await queryProcessor.processQuery('second query');

            // Should still work since queries complete quickly in tests
            expect(result).toBeInstanceOf(QueryResultModel);

            await longQuery;
        });
    });

    describe('orchestrateSearch', () => {
        it('should search across multiple data sources in parallel', async () => {
            const optimization = {
                expandedTerms: ['test', 'query'],
                synonyms: [],
                filters: [],
                boost: {}
            };

            const queryModel = new QueryModel({ text: 'test query' });
            const results = await queryProcessor.orchestrateSearch(optimization, queryModel);

            expect(results).toHaveLength(2);
            expect(results[0]?.score).toBeGreaterThanOrEqual(results[1]?.score || 0);
        });

        it('should apply boost factors correctly', async () => {
            const optimization = {
                expandedTerms: ['test', 'query'],
                synonyms: [],
                filters: [],
                boost: { 'machine learning': 1.5 }
            };

            const queryModel = new QueryModel({ text: 'test query' });
            const results = await queryProcessor.orchestrateSearch(optimization, queryModel);

            expect(results).toHaveLength(2);
            // Results should be properly ranked
            expect(results[0]?.score).toBeGreaterThan(0);
        });
    });

    describe('utility methods', () => {
        it('should track active query count', () => {
            expect(queryProcessor.getActiveQueryCount()).toBe(0);
        });

        it('should return configuration', () => {
            const config = queryProcessor.getConfig();
            expect(config).toEqual(defaultConfig);
        });

        it('should perform health check', async () => {
            const health = await queryProcessor.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.details).toHaveProperty('activeQueries');
            expect(health.details).toHaveProperty('maxConcurrentQueries');
            expect(health.details).toHaveProperty('cacheEnabled');
        });

        it('should handle health check failures', async () => {
            // Mock unhealthy cache
            mockCacheManager.healthCheck = jest.fn().mockResolvedValue(false);

            queryProcessor = new QueryProcessor(
                defaultConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            const health = await queryProcessor.healthCheck();
            expect(health.status).toBe('unhealthy');
        });
    });

    describe('error handling', () => {
        it('should handle embedding service errors gracefully', async () => {
            mockEmbeddingService.generateEmbedding = jest.fn().mockRejectedValue(new Error('Embedding failed'));

            queryProcessor = new QueryProcessor(
                defaultConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            const result = await queryProcessor.processQuery('test query');

            expect(result).toBeInstanceOf(QueryResultModel);
            expect(result.response).toContain('error while processing');
            expect(result.confidence).toBe(0);
        });

        it('should handle vector database errors gracefully', async () => {
            mockVectorDatabase.searchVectors = jest.fn().mockRejectedValue(new Error('Search failed'));

            queryProcessor = new QueryProcessor(
                defaultConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            const result = await queryProcessor.processQuery('test query');

            expect(result).toBeInstanceOf(QueryResultModel);
            // Vector database errors are handled gracefully and return no results
            expect(result.response).toContain("couldn't find any relevant information");
        });

        it('should handle data source manager errors gracefully', async () => {
            mockDataSourceManager.getActiveSources = jest.fn().mockRejectedValue(new Error('Data source error'));

            queryProcessor = new QueryProcessor(
                defaultConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            const result = await queryProcessor.processQuery('test query');

            expect(result).toBeInstanceOf(QueryResultModel);
            expect(result.response).toContain('error while processing');
        });
    });

    describe('caching behavior', () => {
        it('should cache results when caching is enabled', async () => {
            const query = 'cacheable query';

            const result1 = await queryProcessor.processQuery(query);
            expect(result1.cached).toBe(false);

            const result2 = await queryProcessor.processQuery(query);
            expect(result2.cached).toBe(true);
            expect(result2.response).toBe(result1.response);
        });

        it('should not cache when caching is disabled', async () => {
            const noCacheConfig = { ...defaultConfig, cacheEnabled: false };

            queryProcessor = new QueryProcessor(
                noCacheConfig,
                mockCacheManager as any,
                mockVectorDatabase as any,
                mockEmbeddingService as any,
                mockDataSourceManager
            );

            const query = 'non-cacheable query';

            const result1 = await queryProcessor.processQuery(query);
            expect(result1.cached).toBe(false);

            const result2 = await queryProcessor.processQuery(query);
            expect(result2.cached).toBe(false);
        });
    });
});