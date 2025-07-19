import * as fs from 'fs';
import { SystemConfigModel } from '../../models/config';

// Mock fs for file loading tests
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

describe('SystemConfigModel', () => {
    beforeEach(() => {
        // Clear environment variables
        delete process.env.PORT;
        delete process.env.HOST;
        delete process.env.VECTOR_DB_PROVIDER;
        delete process.env.REDIS_HOST;
        delete process.env.EMBEDDING_PROVIDER;
        jest.clearAllMocks();
    });

    describe('constructor and validation', () => {
        it('should create a valid system config with all fields', () => {
            const configData = {
                server: {
                    port: 3000,
                    host: 'localhost',
                    cors: {
                        enabled: true,
                        origins: ['http://localhost:3000']
                    },
                    rateLimit: {
                        windowMs: 60000,
                        maxRequests: 100
                    },
                    timeout: 30000
                },
                database: {
                    vector: {
                        provider: 'faiss' as const,
                        indexName: 'test-index',
                        dimension: 384
                    },
                    metadata: {
                        provider: 'sqlite' as const,
                        connectionString: 'sqlite:./test.db'
                    }
                },
                cache: {
                    redis: {
                        host: 'localhost',
                        port: 6379,
                        db: 0
                    },
                    ttl: {
                        queryResults: 3600,
                        embeddings: 86400,
                        healthChecks: 300
                    },
                    maxMemory: '256mb',
                    evictionPolicy: 'allkeys-lru' as const
                },
                embedding: {
                    provider: 'sentence-transformers' as const,
                    model: 'all-MiniLM-L6-v2',
                    dimension: 384,
                    batchSize: 32,
                    timeout: 30000
                },
                search: {
                    defaultTopK: 10,
                    maxTopK: 100,
                    similarityThreshold: 0.7,
                    hybridSearch: {
                        enabled: false,
                        vectorWeight: 0.7,
                        keywordWeight: 0.3
                    },
                    reranking: {
                        enabled: false
                    }
                },
                monitoring: {
                    metrics: {
                        enabled: true,
                        port: 9090,
                        path: '/metrics'
                    },
                    logging: {
                        level: 'info' as const,
                        format: 'json' as const
                    },
                    healthCheck: {
                        interval: 30000,
                        timeout: 5000
                    }
                },
                dataSources: []
            };

            const config = new SystemConfigModel(configData);

            expect(config.server.port).toBe(3000);
            expect(config.server.host).toBe('localhost');
            expect(config.database.vector.provider).toBe('faiss');
            expect(config.cache.redis.host).toBe('localhost');
            expect(config.embedding.provider).toBe('sentence-transformers');
            expect(config.search.defaultTopK).toBe(10);
            expect(config.monitoring.metrics.enabled).toBe(true);
        });

        it('should create a valid config with minimal data using defaults', () => {
            const config = new SystemConfigModel({});

            expect(config.server.port).toBe(3000);
            expect(config.server.host).toBe('0.0.0.0');
            expect(config.database.vector.provider).toBe('faiss');
            expect(config.cache.redis.host).toBe('localhost');
            expect(config.embedding.provider).toBe('sentence-transformers');
            expect(config.dataSources).toEqual([]);
        });

        it('should sanitize and clamp numeric values', () => {
            const configData = {
                server: {
                    port: 8080, // Valid port
                    host: 'localhost',
                    cors: { enabled: true, origins: ['*'] },
                    rateLimit: {
                        windowMs: 500, // Should be clamped to 1000
                        maxRequests: 20000 // Should be clamped to 10000
                    },
                    timeout: 500000 // Should be clamped to 300000
                },
                database: {
                    vector: {
                        provider: 'faiss' as const,
                        indexName: 'test',
                        dimension: 20000 // Should be clamped to 10000
                    },
                    metadata: {
                        provider: 'sqlite' as const,
                        connectionString: 'sqlite:./test.db'
                    }
                },
                cache: {
                    redis: { host: 'localhost', port: 6379, db: 0 },
                    ttl: {
                        queryResults: 30, // Should be clamped to 60
                        embeddings: 100, // Should be clamped to 300
                        healthChecks: 10 // Should be clamped to 30
                    },
                    maxMemory: '256mb',
                    evictionPolicy: 'allkeys-lru' as const
                },
                embedding: {
                    provider: 'local' as const,
                    model: 'test-model',
                    dimension: 20000, // Should be clamped to 10000
                    batchSize: 2000, // Should be clamped to 1000
                    timeout: 500000 // Should be clamped to 300000
                },
                search: {
                    defaultTopK: 2000, // Should be clamped to 1000
                    maxTopK: 2000, // Should be clamped to 1000
                    similarityThreshold: 1.5, // Should be clamped to 1
                    hybridSearch: {
                        enabled: false,
                        vectorWeight: 1.5, // Should be clamped to 1
                        keywordWeight: -0.5 // Should be clamped to 0
                    },
                    reranking: { enabled: false }
                },
                monitoring: {
                    metrics: { enabled: true, port: 9090, path: '/metrics' },
                    logging: { level: 'info' as const, format: 'json' as const },
                    healthCheck: {
                        interval: 500, // Should be clamped to 1000
                        timeout: 100000 // Should be clamped to 60000
                    }
                },
                dataSources: []
            };

            const config = new SystemConfigModel(configData);

            expect(config.server.port).toBe(8080);
            expect(config.server.rateLimit.windowMs).toBe(1000);
            expect(config.server.rateLimit.maxRequests).toBe(10000);
            expect(config.server.timeout).toBe(300000);
            expect(config.database.vector.dimension).toBe(10000);
            expect(config.cache.ttl.queryResults).toBe(60);
            expect(config.cache.ttl.embeddings).toBe(300);
            expect(config.cache.ttl.healthChecks).toBe(30);
            expect(config.embedding.dimension).toBe(10000);
            expect(config.embedding.batchSize).toBe(1000);
            expect(config.embedding.timeout).toBe(300000);
            expect(config.search.defaultTopK).toBe(1000);
            expect(config.search.maxTopK).toBe(1000);
            expect(config.search.similarityThreshold).toBe(1);
            expect(config.search.hybridSearch.vectorWeight).toBe(1);
            expect(config.search.hybridSearch.keywordWeight).toBe(0);
            expect(config.monitoring.healthCheck.interval).toBe(1000);
            expect(config.monitoring.healthCheck.timeout).toBe(60000);
        });

        it('should sanitize string values by trimming whitespace', () => {
            const configData = {
                server: {
                    port: 3000,
                    host: '  localhost  ',
                    cors: { enabled: true, origins: [] },
                    rateLimit: { windowMs: 60000, maxRequests: 100 },
                    timeout: 30000
                },
                database: {
                    vector: {
                        provider: 'faiss' as const,
                        connectionString: '  faiss://localhost  ',
                        indexName: '  test-index  ',
                        dimension: 384
                    },
                    metadata: {
                        provider: 'sqlite' as const,
                        connectionString: '  sqlite:./test.db  '
                    }
                },
                cache: {
                    redis: {
                        host: '  redis-host  ',
                        port: 6379,
                        password: '  secret  ',
                        db: 0
                    },
                    ttl: { queryResults: 3600, embeddings: 86400, healthChecks: 300 },
                    maxMemory: '256mb',
                    evictionPolicy: 'allkeys-lru' as const
                },
                embedding: {
                    provider: 'openai' as const,
                    model: '  text-embedding-ada-002  ',
                    apiKey: '  sk-test-key  ',
                    dimension: 1536,
                    batchSize: 32,
                    timeout: 30000
                },
                search: {
                    defaultTopK: 10,
                    maxTopK: 100,
                    similarityThreshold: 0.7,
                    hybridSearch: { enabled: false, vectorWeight: 0.7, keywordWeight: 0.3 },
                    reranking: { enabled: false, model: '  rerank-model  ' }
                },
                monitoring: {
                    metrics: { enabled: true, port: 9090, path: '  /metrics  ' },
                    logging: { level: 'info' as const, format: 'json' as const, file: '  ./logs/app.log  ' },
                    healthCheck: { interval: 30000, timeout: 5000 }
                },
                dataSources: []
            };

            const config = new SystemConfigModel(configData);

            expect(config.server.host).toBe('localhost');
            expect(config.database.vector.connectionString).toBe('faiss://localhost');
            expect(config.database.vector.indexName).toBe('test-index');
            expect(config.database.metadata.connectionString).toBe('sqlite:./test.db');
            expect(config.cache.redis.host).toBe('redis-host');
            expect(config.cache.redis.password).toBe('secret');
            expect(config.embedding.model).toBe('text-embedding-ada-002');
            expect(config.embedding.apiKey).toBe('sk-test-key');
            expect(config.search.reranking.model).toBe('rerank-model');
            expect(config.monitoring.metrics.path).toBe('/metrics');
            expect(config.monitoring.logging.file).toBe('./logs/app.log');
        });

        it('should throw error for invalid server port', () => {
            const configData = {
                server: {
                    port: 70000, // Invalid port
                    host: 'localhost',
                    cors: { enabled: true, origins: [] },
                    rateLimit: { windowMs: 60000, maxRequests: 100 },
                    timeout: 30000
                }
            };

            expect(() => new SystemConfigModel(configData)).toThrow('SystemConfig validation failed');
        });

        it('should throw error for invalid vector database provider', () => {
            const configData = {
                database: {
                    vector: {
                        provider: 'invalid' as any,
                        indexName: 'test',
                        dimension: 384
                    },
                    metadata: {
                        provider: 'sqlite' as const,
                        connectionString: 'sqlite:./test.db'
                    }
                }
            };

            expect(() => new SystemConfigModel(configData)).toThrow('SystemConfig validation failed');
        });

        it('should throw error for invalid memory format', () => {
            const configData = {
                cache: {
                    redis: { host: 'localhost', port: 6379, db: 0 },
                    ttl: { queryResults: 3600, embeddings: 86400, healthChecks: 300 },
                    maxMemory: 'invalid-format',
                    evictionPolicy: 'allkeys-lru' as const
                }
            };

            expect(() => new SystemConfigModel(configData)).toThrow('SystemConfig validation failed');
        });
    });

    describe('environment variable loading', () => {
        it('should load configuration from environment variables', () => {
            process.env.PORT = '8080';
            process.env.HOST = 'example.com';
            process.env.VECTOR_DB_PROVIDER = 'pinecone';
            process.env.REDIS_HOST = 'redis.example.com';
            process.env.EMBEDDING_PROVIDER = 'openai';

            const config = SystemConfigModel.fromEnvironment();

            expect(config.server.port).toBe(8080);
            expect(config.server.host).toBe('example.com');
            expect(config.database.vector.provider).toBe('pinecone');
            expect(config.cache.redis.host).toBe('redis.example.com');
            expect(config.embedding.provider).toBe('openai');
        });

        it('should use default values when environment variables are not set', () => {
            const config = SystemConfigModel.fromEnvironment();

            expect(config.server.port).toBe(3000);
            expect(config.server.host).toBe('0.0.0.0');
            expect(config.database.vector.provider).toBe('faiss');
            expect(config.cache.redis.host).toBe('localhost');
            expect(config.embedding.provider).toBe('sentence-transformers');
        });
    });

    describe('file loading', () => {
        it('should load configuration from JSON file', () => {
            const configData = {
                server: { port: 4000, host: 'file-host' },
                database: {
                    vector: { provider: 'weaviate', indexName: 'file-index', dimension: 768 },
                    metadata: { provider: 'postgresql', connectionString: 'postgresql://localhost/test' }
                }
            };

            mockFs.readFileSync.mockReturnValue(JSON.stringify(configData));

            const config = SystemConfigModel.loadFromFile('./config.json');

            expect(config.server.port).toBe(4000);
            expect(config.server.host).toBe('file-host');
            expect(config.database.vector.provider).toBe('weaviate');
            expect(mockFs.readFileSync).toHaveBeenCalledWith('./config.json', 'utf8');
        });

        it('should throw error for invalid JSON file', () => {
            mockFs.readFileSync.mockImplementation(() => {
                throw new Error('File not found');
            });

            expect(() => SystemConfigModel.loadFromFile('./invalid.json')).toThrow('Failed to load configuration from file');
        });

        it('should throw error for malformed JSON', () => {
            mockFs.readFileSync.mockReturnValue('{ invalid json }');

            expect(() => SystemConfigModel.loadFromFile('./malformed.json')).toThrow('Failed to load configuration from file');
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON correctly', () => {
            const config = new SystemConfigModel({});
            const json = config.toJSON();

            expect(json).toHaveProperty('server');
            expect(json).toHaveProperty('database');
            expect(json).toHaveProperty('cache');
            expect(json).toHaveProperty('embedding');
            expect(json).toHaveProperty('search');
            expect(json).toHaveProperty('monitoring');
            expect(json).toHaveProperty('dataSources');
            expect(Array.isArray(json.dataSources)).toBe(true);
        });

        it('should deserialize from JSON correctly', () => {
            const configData = {
                server: {
                    port: 3000,
                    host: 'localhost',
                    cors: { enabled: true, origins: [] },
                    rateLimit: { windowMs: 60000, maxRequests: 100 },
                    timeout: 30000
                }
            };

            const config = SystemConfigModel.fromJSON(configData);

            expect(config.server.port).toBe(3000);
            expect(config.server.host).toBe('localhost');
        });
    });
});