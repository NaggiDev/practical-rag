import { v4 as uuidv4 } from 'uuid';
import { DataSourceModel } from '../../models/dataSource';

describe('DataSourceModel', () => {
    describe('constructor and validation', () => {
        it('should create a valid data source with all fields', () => {
            const sourceData = {
                id: uuidv4(),
                name: 'Test Database',
                type: 'database' as const,
                config: {
                    connectionString: 'postgresql://localhost:5432/test',
                    credentials: {
                        username: 'testuser',
                        password: 'testpass'
                    },
                    syncInterval: 3600,
                    batchSize: 100,
                    timeout: 30000,
                    retryAttempts: 3
                },
                status: 'active' as const,
                lastSync: new Date(),
                documentCount: 1000,
                errorMessage: undefined,
                metadata: { version: '1.0' }
            };

            const source = new DataSourceModel(sourceData);

            expect(source.id).toBe(sourceData.id);
            expect(source.name).toBe(sourceData.name);
            expect(source.type).toBe(sourceData.type);
            expect(source.config).toEqual(sourceData.config);
            expect(source.status).toBe(sourceData.status);
            expect(source.lastSync).toEqual(sourceData.lastSync);
            expect(source.documentCount).toBe(sourceData.documentCount);
            expect(source.metadata).toEqual(sourceData.metadata);
        });

        it('should create a valid data source with minimal required fields', () => {
            const sourceData = {
                name: 'Simple Source',
                type: 'file' as const,
                config: {
                    filePath: '/path/to/file.txt'
                }
            };

            const source = new DataSourceModel(sourceData);

            expect(source.id).toBeDefined();
            expect(source.name).toBe('Simple Source');
            expect(source.type).toBe('file');
            expect(source.status).toBe('inactive');
            expect(source.documentCount).toBe(0);
            expect(source.lastSync).toBeInstanceOf(Date);
        });

        it('should sanitize name by trimming whitespace', () => {
            const sourceData = {
                name: '  Test Source  ',
                type: 'api' as const,
                config: {
                    apiEndpoint: 'https://api.example.com'
                }
            };

            const source = new DataSourceModel(sourceData);

            expect(source.name).toBe('Test Source');
        });

        it('should sanitize and clamp numeric values', () => {
            const sourceData = {
                name: 'Test Source',
                type: 'database' as const,
                config: {
                    syncInterval: 30, // Should be clamped to 60
                    batchSize: 20000, // Should be clamped to 10000
                    timeout: 500, // Should be clamped to 1000
                    retryAttempts: 15 // Should be clamped to 10
                },
                documentCount: -5 // Should be clamped to 0
            };

            const source = new DataSourceModel(sourceData);

            expect(source.config.syncInterval).toBe(60);
            expect(source.config.batchSize).toBe(10000);
            expect(source.config.timeout).toBe(1000);
            expect(source.config.retryAttempts).toBe(10);
            expect(source.documentCount).toBe(0);
        });

        it('should throw error for invalid name (empty)', () => {
            const sourceData = {
                name: '',
                type: 'file' as const,
                config: {}
            };

            expect(() => new DataSourceModel(sourceData)).toThrow('DataSource validation failed');
        });

        it('should throw error for invalid type', () => {
            const sourceData = {
                name: 'Test Source',
                type: 'invalid' as any,
                config: {}
            };

            expect(() => new DataSourceModel(sourceData)).toThrow('DataSource validation failed');
        });

        it('should throw error for invalid API endpoint URL', () => {
            const sourceData = {
                name: 'Test Source',
                type: 'api' as const,
                config: {
                    apiEndpoint: 'not-a-valid-url'
                }
            };

            expect(() => new DataSourceModel(sourceData)).toThrow('DataSource validation failed');
        });

        it('should throw error for invalid UUID', () => {
            const sourceData = {
                id: 'invalid-uuid',
                name: 'Test Source',
                type: 'file' as const,
                config: {}
            };

            expect(() => new DataSourceModel(sourceData)).toThrow('DataSource validation failed');
        });
    });

    describe('methods', () => {
        let source: DataSourceModel;

        beforeEach(() => {
            source = new DataSourceModel({
                name: 'Test Source',
                type: 'database',
                config: {
                    connectionString: 'postgresql://localhost:5432/test'
                }
            });
        });

        it('should update status correctly', () => {
            const updatedSource = source.updateStatus('active');

            expect(updatedSource.status).toBe('active');
            expect(updatedSource.errorMessage).toBeUndefined();
            expect(updatedSource.lastSync).toBeInstanceOf(Date);
        });

        it('should update status with error message', () => {
            const errorMessage = 'Connection failed';
            const updatedSource = source.updateStatus('error', errorMessage);

            expect(updatedSource.status).toBe('error');
            expect(updatedSource.errorMessage).toBe(errorMessage);
        });

        it('should update document count correctly', () => {
            const newCount = 500;
            const updatedSource = source.updateDocumentCount(newCount);

            expect(updatedSource.documentCount).toBe(newCount);
            expect(updatedSource.lastSync).toBeInstanceOf(Date);
        });
    });

    describe('serialization', () => {
        it('should serialize to JSON correctly', () => {
            const sourceData = {
                name: 'Test Source',
                type: 'file' as const,
                config: {
                    filePath: '/test/path'
                },
                metadata: { test: true }
            };

            const source = new DataSourceModel(sourceData);
            const json = source.toJSON();

            expect(json).toEqual({
                id: source.id,
                name: source.name,
                type: source.type,
                config: source.config,
                status: source.status,
                lastSync: source.lastSync,
                documentCount: source.documentCount,
                errorMessage: source.errorMessage,
                metadata: source.metadata
            });
        });

        it('should deserialize from JSON correctly', () => {
            const sourceData = {
                id: uuidv4(),
                name: 'Test Source',
                type: 'api' as const,
                config: {
                    apiEndpoint: 'https://api.example.com'
                },
                status: 'active' as const,
                lastSync: new Date(),
                documentCount: 100
            };

            const source = DataSourceModel.fromJSON(sourceData);

            expect(source.id).toBe(sourceData.id);
            expect(source.name).toBe(sourceData.name);
            expect(source.type).toBe(sourceData.type);
            expect(source.config).toEqual(sourceData.config);
            expect(source.status).toBe(sourceData.status);
            expect(source.lastSync).toEqual(sourceData.lastSync);
            expect(source.documentCount).toBe(sourceData.documentCount);
        });
    });
});