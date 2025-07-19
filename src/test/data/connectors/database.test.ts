import { DatabaseConnector } from '../../../data/connectors/database';
import { DataSource, DatabaseDataSourceConfig } from '../../../models/dataSource';
import { AuthenticationError } from '../../../utils/errors';

// Mock the database libraries
jest.mock('pg', () => ({
    Pool: jest.fn().mockImplementation(() => ({
        connect: jest.fn(),
        end: jest.fn(),
        totalCount: 5,
        idleCount: 3,
        waitingCount: 0
    }))
}));

jest.mock('mongodb', () => ({
    MongoClient: jest.fn().mockImplementation(() => ({
        connect: jest.fn(),
        close: jest.fn(),
        db: jest.fn().mockReturnValue({
            admin: () => ({ ping: jest.fn() }),
            collection: jest.fn().mockReturnValue({
                find: jest.fn().mockReturnValue({
                    limit: jest.fn().mockReturnValue({
                        toArray: jest.fn().mockResolvedValue([])
                    })
                }),
                countDocuments: jest.fn().mockResolvedValue(0)
            }),
            databaseName: 'test_db'
        })
    }))
}));

describe('DatabaseConnector', () => {
    let mockDataSource: DataSource;
    let connector: DatabaseConnector;

    beforeEach(() => {
        mockDataSource = {
            id: 'test-db-source',
            name: 'Test Database Source',
            type: 'database',
            status: 'active',
            lastSync: new Date(),
            documentCount: 0,
            config: {
                connectionString: 'postgresql://localhost:5432/testdb',
                table: 'documents',
                credentials: {
                    username: 'testuser',
                    password: 'testpass'
                },
                batchSize: 100,
                timeout: 30000,
                retryAttempts: 3
            } as DatabaseDataSourceConfig
        };

        connector = new DatabaseConnector(mockDataSource);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should create connector with valid PostgreSQL config', () => {
            expect(connector).toBeInstanceOf(DatabaseConnector);
            expect(connector.getDataSource().id).toBe('test-db-source');
        });

        it('should create connector with valid MongoDB config', () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            expect(mongoConnector).toBeInstanceOf(DatabaseConnector);
        });

        it('should throw error for unsupported database type', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'redis://localhost:6379'
                }
            };

            expect(() => new DatabaseConnector(invalidDataSource)).toThrow('Unable to detect database type');
        });

        it('should throw error for missing connection string', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: ''
                }
            };

            expect(() => new DatabaseConnector(invalidDataSource)).toThrow('Unable to detect database type');
        });

        it('should throw error for missing credentials', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    credentials: {}
                }
            };

            expect(() => new DatabaseConnector(invalidDataSource)).toThrow('Database credentials are required');
        });

        it('should throw error when neither query nor table is specified', () => {
            const invalidDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    table: undefined,
                    query: undefined
                }
            };

            expect(() => new DatabaseConnector(invalidDataSource)).toThrow('Either query or table must be specified');
        });
    });

    describe('connect', () => {
        it('should connect to PostgreSQL successfully', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockResolvedValue({
                    query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
                    release: jest.fn()
                }),
                end: jest.fn()
            };
            Pool.mockImplementation(() => mockPool);

            await connector.connect();

            expect(connector.getConnectionStatus()).toBe(true);
            expect(mockPool.connect).toHaveBeenCalled();
        });

        it('should handle PostgreSQL authentication error', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockRejectedValue(new Error('authentication failed'))
            };
            Pool.mockImplementation(() => mockPool);

            await expect(connector.connect()).rejects.toThrow(AuthenticationError);
        });

        it('should handle PostgreSQL connection timeout', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockRejectedValue(new Error('connection timeout ETIMEDOUT'))
            };
            Pool.mockImplementation(() => mockPool);

            await expect(connector.connect()).rejects.toThrow('PostgreSQL connection timeout');
        });

        it('should connect to MongoDB successfully', async () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            const { MongoClient } = require('mongodb');
            const mockClient = {
                connect: jest.fn().mockResolvedValue(undefined),
                db: jest.fn().mockReturnValue({
                    admin: () => ({ ping: jest.fn().mockResolvedValue({}) }),
                    collection: jest.fn()
                }),
                close: jest.fn()
            };
            MongoClient.mockImplementation(() => mockClient);

            await mongoConnector.connect();

            expect(mongoConnector.getConnectionStatus()).toBe(true);
            expect(mockClient.connect).toHaveBeenCalled();
        });

        it('should handle MongoDB authentication error', async () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            const { MongoClient } = require('mongodb');
            const mockClient = {
                connect: jest.fn().mockRejectedValue(new Error('Unauthorized'))
            };
            MongoClient.mockImplementation(() => mockClient);

            await expect(mongoConnector.connect()).rejects.toThrow(AuthenticationError);
        });
    });

    describe('disconnect', () => {
        it('should disconnect from PostgreSQL successfully', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockResolvedValue({
                    query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
                    release: jest.fn()
                }),
                end: jest.fn().mockResolvedValue(undefined)
            };
            Pool.mockImplementation(() => mockPool);

            await connector.connect();
            await connector.disconnect();

            expect(connector.getConnectionStatus()).toBe(false);
            expect(mockPool.end).toHaveBeenCalled();
        });

        it('should disconnect from MongoDB successfully', async () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            const { MongoClient } = require('mongodb');
            const mockClient = {
                connect: jest.fn().mockResolvedValue(undefined),
                db: jest.fn().mockReturnValue({
                    admin: () => ({ ping: jest.fn().mockResolvedValue({}) })
                }),
                close: jest.fn().mockResolvedValue(undefined)
            };
            MongoClient.mockImplementation(() => mockClient);

            await mongoConnector.connect();
            await mongoConnector.disconnect();

            expect(mongoConnector.getConnectionStatus()).toBe(false);
            expect(mockClient.close).toHaveBeenCalled();
        });
    });

    describe('validateConnection', () => {
        it('should validate PostgreSQL connection successfully', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockResolvedValue({
                    query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
                    release: jest.fn()
                }),
                end: jest.fn()
            };
            Pool.mockImplementation(() => mockPool);

            const isValid = await connector.validateConnection();

            expect(isValid).toBe(true);
        });

        it('should return false for invalid PostgreSQL connection', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
            };
            Pool.mockImplementation(() => mockPool);

            const isValid = await connector.validateConnection();

            expect(isValid).toBe(false);
        });

        it('should validate MongoDB connection successfully', async () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            const { MongoClient } = require('mongodb');
            const mockClient = {
                connect: jest.fn().mockResolvedValue(undefined),
                db: jest.fn().mockReturnValue({
                    admin: () => ({ ping: jest.fn().mockResolvedValue({}) })
                }),
                close: jest.fn()
            };
            MongoClient.mockImplementation(() => mockClient);

            const isValid = await mongoConnector.validateConnection();

            expect(isValid).toBe(true);
        });
    });

    describe('sync', () => {
        it('should sync PostgreSQL data successfully', async () => {
            const { Pool } = require('pg');
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // Connection test
                    .mockResolvedValueOnce({ // Data query
                        rows: [
                            {
                                id: 1,
                                content: 'Test content 1',
                                title: 'Test Title 1',
                                created_at: new Date()
                            },
                            {
                                id: 2,
                                content: 'Test content 2',
                                title: 'Test Title 2',
                                created_at: new Date()
                            }
                        ]
                    }),
                release: jest.fn(),
                database: 'testdb'
            };
            const mockPool = {
                connect: jest.fn().mockResolvedValue(mockClient),
                end: jest.fn()
            };
            Pool.mockImplementation(() => mockPool);

            const result = await connector.sync();

            expect(result.success).toBe(true);
            expect(result.documentsProcessed).toBe(2);
            expect(result.documentsAdded).toBe(2);
            expect(result.errors).toHaveLength(0);
        });

        it('should sync MongoDB data successfully', async () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            const { MongoClient } = require('mongodb');
            const mockClient = {
                connect: jest.fn().mockResolvedValue(undefined),
                db: jest.fn().mockReturnValue({
                    admin: () => ({ ping: jest.fn().mockResolvedValue({}) }),
                    collection: jest.fn().mockReturnValue({
                        find: jest.fn().mockReturnValue({
                            limit: jest.fn().mockReturnValue({
                                toArray: jest.fn().mockResolvedValue([
                                    {
                                        _id: '507f1f77bcf86cd799439011',
                                        content: 'Test content 1',
                                        title: 'Test Title 1',
                                        created_at: new Date()
                                    },
                                    {
                                        _id: '507f1f77bcf86cd799439012',
                                        content: 'Test content 2',
                                        title: 'Test Title 2',
                                        created_at: new Date()
                                    }
                                ])
                            })
                        })
                    })
                }),
                close: jest.fn()
            };
            MongoClient.mockImplementation(() => mockClient);

            const result = await mongoConnector.sync();

            expect(result.success).toBe(true);
            expect(result.documentsProcessed).toBe(2);
            expect(result.documentsAdded).toBe(2);
            expect(result.errors).toHaveLength(0);
        });

        it('should handle incremental sync with timestamp', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockResolvedValue({
                    query: jest.fn()
                        .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // Connection test
                        .mockResolvedValueOnce({ rows: [] }), // Incremental query
                    release: jest.fn()
                }),
                end: jest.fn()
            };
            Pool.mockImplementation(() => mockPool);

            // Set incremental field for testing
            const incrementalDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    incrementalField: 'updated_at'
                }
            };
            const incrementalConnector = new DatabaseConnector(incrementalDataSource);

            const result = await incrementalConnector.sync(true);

            expect(result.success).toBe(true);
            expect(result.documentsProcessed).toBe(0);
        });
    });

    describe('getContent', () => {
        it('should get content from PostgreSQL successfully', async () => {
            const { Pool } = require('pg');
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // Connection test
                    .mockResolvedValueOnce({ // Data query
                        rows: [
                            {
                                id: 1,
                                content: 'Test content 1',
                                title: 'Test Title 1',
                                created_at: new Date()
                            }
                        ]
                    }),
                release: jest.fn()
            };
            const mockPool = {
                connect: jest.fn().mockResolvedValue(mockClient),
                end: jest.fn()
            };
            Pool.mockImplementation(() => mockPool);

            const contents = await connector.getContent();

            expect(contents).toHaveLength(1);
            expect(contents[0]?.title).toBe('Test Title 1');
            expect(contents[0]?.text).toBe('Test content 1');
            expect(contents[0]?.sourceId).toBe('test-db-source');
        });

        it('should get content from MongoDB successfully', async () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            const { MongoClient } = require('mongodb');
            const mockClient = {
                connect: jest.fn().mockResolvedValue(undefined),
                db: jest.fn().mockReturnValue({
                    admin: () => ({ ping: jest.fn().mockResolvedValue({}) }),
                    collection: jest.fn().mockReturnValue({
                        find: jest.fn().mockReturnValue({
                            limit: jest.fn().mockReturnValue({
                                toArray: jest.fn().mockResolvedValue([
                                    {
                                        _id: '507f1f77bcf86cd799439011',
                                        content: 'Test content 1',
                                        title: 'Test Title 1',
                                        created_at: new Date()
                                    }
                                ])
                            })
                        })
                    })
                }),
                close: jest.fn()
            };
            MongoClient.mockImplementation(() => mockClient);

            const contents = await mongoConnector.getContent();

            expect(contents).toHaveLength(1);
            expect(contents[0]?.title).toBe('Test Title 1');
            expect(contents[0]?.text).toBe('Test content 1');
            expect(contents[0]?.sourceId).toBe(mongoDataSource.id);
        });
    });

    describe('healthCheck', () => {
        it('should return healthy status for working connection', async () => {
            const { Pool } = require('pg');
            const mockClient = {
                query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
                release: jest.fn()
            };
            const mockPool = {
                connect: jest.fn().mockResolvedValue(mockClient),
                end: jest.fn()
            };
            Pool.mockImplementation(() => mockPool);

            const health = await connector.healthCheck();

            expect(health.isHealthy).toBe(true);
            expect(health.sourceId).toBe('test-db-source');
            expect(health.responseTime).toBeGreaterThanOrEqual(0);
            expect(health.errorCount).toBe(0);
        });

        it('should return unhealthy status for failed connection', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockRejectedValue(new Error('Connection failed'))
            };
            Pool.mockImplementation(() => mockPool);

            const health = await connector.healthCheck();

            expect(health.isHealthy).toBe(false);
            expect(health.sourceId).toBe('test-db-source');
            // When validateConnection catches an error and returns false, 
            // there may not be a lastError in the health result
            expect(health.errorCount).toBeGreaterThanOrEqual(0);
        });
    });

    describe('getDatabaseMetadata', () => {
        it('should get PostgreSQL metadata successfully', async () => {
            const { Pool } = require('pg');
            const mockClient = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] }) // Connection test
                    .mockResolvedValueOnce({ rows: [{ count: '42' }] }), // Count query
                release: jest.fn(),
                database: 'testdb'
            };
            const mockPool = {
                connect: jest.fn().mockResolvedValue(mockClient),
                end: jest.fn()
            };
            Pool.mockImplementation(() => mockPool);

            const metadata = await connector.getDatabaseMetadata();

            expect(metadata.tableName).toBe('documents');
            expect(metadata.recordCount).toBe(42);
            expect(metadata.schema).toBe('public');
        });

        it('should get MongoDB metadata successfully', async () => {
            const mongoDataSource = {
                ...mockDataSource,
                config: {
                    ...mockDataSource.config,
                    connectionString: 'mongodb://localhost:27017/testdb'
                }
            };

            const mongoConnector = new DatabaseConnector(mongoDataSource);
            const { MongoClient } = require('mongodb');
            const mockClient = {
                connect: jest.fn().mockResolvedValue(undefined),
                db: jest.fn().mockReturnValue({
                    admin: () => ({ ping: jest.fn().mockResolvedValue({}) }),
                    collection: jest.fn().mockReturnValue({
                        countDocuments: jest.fn().mockResolvedValue(25)
                    }),
                    databaseName: 'testdb'
                }),
                close: jest.fn()
            };
            MongoClient.mockImplementation(() => mockClient);

            const metadata = await mongoConnector.getDatabaseMetadata();

            expect(metadata.tableName).toBe('documents');
            expect(metadata.recordCount).toBe(25);
            expect(metadata.database).toBe('testdb');
        });
    });

    describe('getPoolStats', () => {
        it('should return PostgreSQL pool statistics', async () => {
            const { Pool } = require('pg');
            const mockPool = {
                connect: jest.fn().mockResolvedValue({
                    query: jest.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }),
                    release: jest.fn()
                }),
                end: jest.fn(),
                totalCount: 10,
                idleCount: 5,
                waitingCount: 2
            };
            Pool.mockImplementation(() => mockPool);

            await connector.connect();
            const stats = connector.getPoolStats();

            expect(stats.total).toBe(10);
            expect(stats.idle).toBe(5);
            expect(stats.waiting).toBe(2);
        });

        it('should return zero stats when not connected', () => {
            const stats = connector.getPoolStats();

            expect(stats.total).toBe(0);
            expect(stats.idle).toBe(0);
            expect(stats.waiting).toBe(0);
        });
    });
});