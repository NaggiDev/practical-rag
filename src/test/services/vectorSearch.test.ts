import { SearchOptions, VectorDatabase, VectorDatabaseConfig, VectorRecord } from '../../services/vectorSearch';
import { DataSourceError } from '../../utils/errors';

// Mock external dependencies
jest.mock('faiss-node');
jest.mock('@qdrant/js-client-rest');
jest.mock('@pinecone-database/pinecone');

const mockFaissIndex = {
    add: jest.fn(),
    search: jest.fn(),
    train: jest.fn(),
    ntotal: 0
};

const mockQdrantClient = {
    getCollections: jest.fn(),
    upsert: jest.fn(),
    search: jest.fn(),
    delete: jest.fn(),
    getCollection: jest.fn(),
    updateCollection: jest.fn()
};

const mockPineconeClient = {
    init: jest.fn(),
    Index: jest.fn()
};

const mockPineconeIndex = {
    upsert: jest.fn(),
    query: jest.fn(),
    delete1: jest.fn(),
    describeIndexStats: jest.fn()
};

// Mock the modules
jest.mock('faiss-node', () => ({
    IndexFlatL2: jest.fn(() => mockFaissIndex),
    MetricType: {
        METRIC_L2: 'METRIC_L2'
    }
}));

jest.mock('@qdrant/js-client-rest', () => ({
    QdrantClient: jest.fn(() => mockQdrantClient)
}));

jest.mock('@pinecone-database/pinecone', () => ({
    PineconeClient: jest.fn(() => mockPineconeClient)
}));

describe('VectorDatabase', () => {
    let vectorDb: VectorDatabase;

    beforeEach(() => {
        jest.clearAllMocks();
        mockPineconeClient.Index.mockReturnValue(mockPineconeIndex);
    });

    describe('FAISS Provider', () => {
        beforeEach(() => {
            const config: VectorDatabaseConfig = {
                provider: 'faiss',
                dimension: 128,
                indexType: 'flat'
            };
            vectorDb = new VectorDatabase(config);
        });

        it('should initialize FAISS index correctly', async () => {
            await vectorDb.initialize();

            expect(require('faiss-node').IndexFlatL2).toHaveBeenCalledWith(128);
        });

        it('should initialize with default flat index type', async () => {
            const config: VectorDatabaseConfig = {
                provider: 'faiss',
                dimension: 128,
                indexType: 'ivf' // Will fallback to flat
            };
            vectorDb = new VectorDatabase(config);

            await vectorDb.initialize();

            expect(require('faiss-node').IndexFlatL2).toHaveBeenCalledWith(128);
        });

        it('should store vectors in FAISS index', async () => {
            const vectors: VectorRecord[] = [
                {
                    id: 'vec1',
                    vector: [0.1, 0.2, 0.3],
                    metadata: { type: 'test' }
                },
                {
                    id: 'vec2',
                    vector: [0.4, 0.5, 0.6],
                    metadata: { type: 'test2' }
                }
            ];

            await vectorDb.storeVectors(vectors);

            expect(mockFaissIndex.add).toHaveBeenCalledWith(
                [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
            );
        });

        it('should search vectors in FAISS index', async () => {
            const queryVector = [0.1, 0.2, 0.3];
            const options: SearchOptions = {
                topK: 5,
                includeMetadata: true
            };

            mockFaissIndex.search.mockReturnValue({
                labels: [0, 1],
                distances: [0.1, 0.2]
            });

            // First store some vectors
            const vectors: VectorRecord[] = [
                {
                    id: 'vec1',
                    vector: [0.1, 0.2, 0.3],
                    metadata: { type: 'test' }
                },
                {
                    id: 'vec2',
                    vector: [0.4, 0.5, 0.6],
                    metadata: { type: 'test2' }
                }
            ];
            await vectorDb.storeVectors(vectors);

            const results = await vectorDb.searchVectors(queryVector, options);

            expect(mockFaissIndex.search).toHaveBeenCalledWith(
                [0.1, 0.2, 0.3],
                5
            );
            expect(results).toHaveLength(2);
            expect(results[0]).toHaveProperty('id');
            expect(results[0]).toHaveProperty('score');
            expect(results[0]).toHaveProperty('metadata');
        });

        it('should optimize FAISS index', async () => {
            await vectorDb.optimizeIndex();
            // For flat index, no training is needed
            expect(mockFaissIndex.train).not.toHaveBeenCalled();
        });

        it('should get FAISS index stats', async () => {
            mockFaissIndex.ntotal = 100;

            const stats = await vectorDb.getIndexStats();

            expect(stats).toEqual({
                totalVectors: 100,
                dimension: 128,
                indexType: 'flat',
                memoryUsage: 100 * 128 * 4,
                lastUpdated: expect.any(Date)
            });
        });
    });

    describe('Qdrant Provider', () => {
        beforeEach(() => {
            const config: VectorDatabaseConfig = {
                provider: 'qdrant',
                dimension: 128,
                connectionString: 'http://localhost:6333',
                indexName: 'test-collection',
                apiKey: 'test-key'
            };
            vectorDb = new VectorDatabase(config);
        });

        it('should initialize Qdrant client correctly', async () => {
            mockQdrantClient.getCollections.mockResolvedValue([]);

            await vectorDb.initialize();

            expect(require('@qdrant/js-client-rest').QdrantClient).toHaveBeenCalledWith({
                url: 'http://localhost:6333',
                apiKey: 'test-key'
            });
            expect(mockQdrantClient.getCollections).toHaveBeenCalled();
        });

        it('should throw error when connection string is missing', async () => {
            const config: VectorDatabaseConfig = {
                provider: 'qdrant',
                dimension: 128
            };
            vectorDb = new VectorDatabase(config);

            await expect(vectorDb.initialize()).rejects.toThrow(DataSourceError);
        });

        it('should store vectors in Qdrant', async () => {
            const vectors: VectorRecord[] = [
                {
                    id: 'vec1',
                    vector: [0.1, 0.2, 0.3],
                    metadata: { type: 'test' }
                }
            ];

            mockQdrantClient.getCollections.mockResolvedValue([]);
            mockQdrantClient.upsert.mockResolvedValue({});

            await vectorDb.storeVectors(vectors);

            expect(mockQdrantClient.upsert).toHaveBeenCalledWith('test-collection', {
                wait: true,
                points: [{
                    id: 'vec1',
                    vector: [0.1, 0.2, 0.3],
                    payload: { type: 'test' }
                }]
            });
        });

        it('should search vectors in Qdrant', async () => {
            const queryVector = [0.1, 0.2, 0.3];
            const options: SearchOptions = {
                topK: 5,
                includeMetadata: true,
                threshold: 0.8
            };

            mockQdrantClient.getCollections.mockResolvedValue([]);
            mockQdrantClient.search.mockResolvedValue([
                {
                    id: 'vec1',
                    score: 0.9,
                    payload: { type: 'test' }
                }
            ]);

            const results = await vectorDb.searchVectors(queryVector, options);

            expect(mockQdrantClient.search).toHaveBeenCalledWith('test-collection', {
                vector: queryVector,
                limit: 5,
                filter: undefined,
                with_payload: true,
                score_threshold: 0.8
            });
            expect(results).toHaveLength(1);
            expect(results[0]).toEqual({
                id: 'vec1',
                score: 0.9,
                metadata: { type: 'test' }
            });
        });

        it('should delete vectors from Qdrant', async () => {
            mockQdrantClient.getCollections.mockResolvedValue([]);
            mockQdrantClient.delete.mockResolvedValue({});

            await vectorDb.deleteVectors(['vec1', 'vec2']);

            expect(mockQdrantClient.delete).toHaveBeenCalledWith('test-collection', {
                wait: true,
                points: ['vec1', 'vec2']
            });
        });

        it('should get Qdrant collection stats', async () => {
            mockQdrantClient.getCollections.mockResolvedValue([]);
            mockQdrantClient.getCollection.mockResolvedValue({
                points_count: 1000
            });

            const stats = await vectorDb.getIndexStats();

            expect(stats).toEqual({
                totalVectors: 1000,
                dimension: 128,
                indexType: 'qdrant',
                lastUpdated: expect.any(Date)
            });
        });
    });

    describe('Pinecone Provider', () => {
        beforeEach(() => {
            const config: VectorDatabaseConfig = {
                provider: 'pinecone',
                dimension: 128,
                apiKey: 'test-key',
                environment: 'test-env',
                indexName: 'test-index'
            };
            vectorDb = new VectorDatabase(config);
        });

        it('should initialize Pinecone client correctly', async () => {
            mockPineconeClient.init.mockResolvedValue({});

            await vectorDb.initialize();

            expect(mockPineconeClient.init).toHaveBeenCalledWith({
                apiKey: 'test-key',
                environment: 'test-env'
            });
        });

        it('should throw error when API key or environment is missing', async () => {
            const config: VectorDatabaseConfig = {
                provider: 'pinecone',
                dimension: 128
            };
            vectorDb = new VectorDatabase(config);

            await expect(vectorDb.initialize()).rejects.toThrow(DataSourceError);
        });

        it('should store vectors in Pinecone', async () => {
            const vectors: VectorRecord[] = [
                {
                    id: 'vec1',
                    vector: [0.1, 0.2, 0.3],
                    metadata: { type: 'test' }
                }
            ];

            mockPineconeClient.init.mockResolvedValue({});
            mockPineconeIndex.upsert.mockResolvedValue({});

            await vectorDb.storeVectors(vectors);

            expect(mockPineconeIndex.upsert).toHaveBeenCalledWith({
                upsertRequest: {
                    vectors: [{
                        id: 'vec1',
                        values: [0.1, 0.2, 0.3],
                        metadata: { type: 'test' }
                    }]
                }
            });
        });

        it('should search vectors in Pinecone', async () => {
            const queryVector = [0.1, 0.2, 0.3];
            const options: SearchOptions = {
                topK: 5,
                includeMetadata: true,
                filter: { type: 'test' }
            };

            mockPineconeClient.init.mockResolvedValue({});
            mockPineconeIndex.query.mockResolvedValue({
                matches: [
                    {
                        id: 'vec1',
                        score: 0.9,
                        metadata: { type: 'test' }
                    }
                ]
            });

            const results = await vectorDb.searchVectors(queryVector, options);

            expect(mockPineconeIndex.query).toHaveBeenCalledWith({
                queryRequest: {
                    vector: queryVector,
                    topK: 5,
                    includeMetadata: true,
                    filter: { type: 'test' }
                }
            });
            expect(results).toHaveLength(1);
            expect(results[0]).toEqual({
                id: 'vec1',
                score: 0.9,
                metadata: { type: 'test' }
            });
        });

        it('should delete vectors from Pinecone', async () => {
            mockPineconeClient.init.mockResolvedValue({});
            mockPineconeIndex.delete1.mockResolvedValue({});

            await vectorDb.deleteVectors(['vec1', 'vec2']);

            expect(mockPineconeIndex.delete1).toHaveBeenCalledWith({
                ids: ['vec1', 'vec2']
            });
        });

        it('should get Pinecone index stats', async () => {
            mockPineconeClient.init.mockResolvedValue({});
            mockPineconeIndex.describeIndexStats.mockResolvedValue({
                totalVectorCount: 500
            });

            const stats = await vectorDb.getIndexStats();

            expect(stats).toEqual({
                totalVectors: 500,
                dimension: 128,
                indexType: 'pinecone',
                lastUpdated: expect.any(Date)
            });
        });
    });

    describe('Error Handling', () => {
        beforeEach(() => {
            const config: VectorDatabaseConfig = {
                provider: 'faiss',
                dimension: 128
            };
            vectorDb = new VectorDatabase(config);
        });

        it('should throw ValidationError for unsupported provider', async () => {
            const config: VectorDatabaseConfig = {
                provider: 'unsupported' as any,
                dimension: 128
            };
            vectorDb = new VectorDatabase(config);

            await expect(vectorDb.initialize()).rejects.toThrow(DataSourceError);
        });

        it('should handle initialization errors', async () => {
            const IndexFlatL2 = require('faiss-node').IndexFlatL2;
            IndexFlatL2.mockImplementation(() => {
                throw new Error('FAISS initialization failed');
            });

            await expect(vectorDb.initialize()).rejects.toThrow(DataSourceError);
        });

        it('should handle store vector errors', async () => {
            mockFaissIndex.add.mockImplementation(() => {
                throw new Error('Store failed');
            });

            const vectors: VectorRecord[] = [
                {
                    id: 'vec1',
                    vector: [0.1, 0.2, 0.3],
                    metadata: {}
                }
            ];

            await expect(vectorDb.storeVectors(vectors)).rejects.toThrow(DataSourceError);
        });

        it('should handle search errors', async () => {
            mockFaissIndex.search.mockImplementation(() => {
                throw new Error('Search failed');
            });

            const queryVector = [0.1, 0.2, 0.3];
            const options: SearchOptions = { topK: 5 };

            await expect(vectorDb.searchVectors(queryVector, options)).rejects.toThrow(DataSourceError);
        });
    });

    describe('Health Check', () => {
        beforeEach(() => {
            const config: VectorDatabaseConfig = {
                provider: 'faiss',
                dimension: 128,
                indexName: 'test-index'
            };
            vectorDb = new VectorDatabase(config);
        });

        it('should return healthy status when working correctly', async () => {
            // Ensure the mock doesn't throw during initialization
            const IndexFlatL2 = require('faiss-node').IndexFlatL2;
            IndexFlatL2.mockReturnValue(mockFaissIndex);
            mockFaissIndex.ntotal = 100;

            const health = await vectorDb.healthCheck();

            expect(health.status).toBe('healthy');
            expect(health.details).toEqual({
                provider: 'faiss',
                indexName: 'test-index',
                dimension: 128,
                totalVectors: 100,
                indexType: 'flat',
                lastCheck: expect.any(String)
            });
        });

        it('should return unhealthy status on error', async () => {
            const IndexFlatL2 = require('faiss-node').IndexFlatL2;
            IndexFlatL2.mockImplementation(() => {
                throw new Error('Initialization failed');
            });

            const health = await vectorDb.healthCheck();

            expect(health.status).toBe('unhealthy');
            expect(health.details).toHaveProperty('error');
        });
    });

    describe('Configuration', () => {
        it('should return configuration correctly', () => {
            const config: VectorDatabaseConfig = {
                provider: 'faiss',
                dimension: 256,
                indexType: 'ivf',
                nlist: 200
            };
            vectorDb = new VectorDatabase(config);

            const returnedConfig = vectorDb.getConfig();

            expect(returnedConfig).toEqual({
                provider: 'faiss',
                dimension: 256,
                indexType: 'ivf',
                nlist: 200,
                metricType: 'l2',
                timeout: 30000
            });
        });
    });

    describe('Cleanup', () => {
        it('should clean up resources on close', async () => {
            const config: VectorDatabaseConfig = {
                provider: 'faiss',
                dimension: 128
            };
            vectorDb = new VectorDatabase(config);

            await vectorDb.close();

            // Should be able to call close without errors
            expect(true).toBe(true);
        });
    });

    describe('Search Options', () => {
        beforeEach(() => {
            const config: VectorDatabaseConfig = {
                provider: 'faiss',
                dimension: 128
            };
            vectorDb = new VectorDatabase(config);
        });

        it('should filter results by threshold', async () => {
            // Ensure the mock doesn't throw during initialization
            const IndexFlatL2 = require('faiss-node').IndexFlatL2;
            IndexFlatL2.mockReturnValue(mockFaissIndex);

            // Reset the mock to not throw errors
            mockFaissIndex.add.mockImplementation(() => { });

            const queryVector = [0.1, 0.2, 0.3];
            const options: SearchOptions = {
                topK: 5,
                threshold: 0.5
            };

            mockFaissIndex.search.mockReturnValue({
                labels: [0, 1],
                distances: [0.1, 0.8] // Second result should be filtered out
            });

            // Store test vectors
            const vectors: VectorRecord[] = [
                {
                    id: 'vec1',
                    vector: [0.1, 0.2, 0.3],
                    metadata: { type: 'test' }
                },
                {
                    id: 'vec2',
                    vector: [0.4, 0.5, 0.6],
                    metadata: { type: 'test2' }
                }
            ];
            await vectorDb.storeVectors(vectors);

            const results = await vectorDb.searchVectors(queryVector, options);

            // Only one result should pass the threshold
            expect(results).toHaveLength(1);
            expect(results[0]?.score).toBeGreaterThan(0.5);
        });
    });
});