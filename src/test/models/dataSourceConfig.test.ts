import { ApiDataSourceConfig, DatabaseDataSourceConfig, DataSourceConfigModel, FileDataSourceConfig } from '../../models/dataSource';

describe('DataSourceConfigModel', () => {
    describe('File Data Source Configuration', () => {
        it('should create valid file data source config', () => {
            const config: Partial<FileDataSourceConfig> = {
                filePath: './src/test/test-data',
                fileTypes: ['pdf', 'txt'],
                watchForChanges: true,
                recursive: false,
                syncInterval: 300
            };

            const configModel = DataSourceConfigModel.createFileConfig(config);
            expect(configModel.type).toBe('file');
            expect(configModel.config.filePath).toBe('./src/test/test-data');
            expect((configModel.config as FileDataSourceConfig).fileTypes).toEqual(['pdf', 'txt']);
        });

        it('should validate required filePath for file config', () => {
            const config = {
                fileTypes: ['pdf']
            };

            expect(() => {
                DataSourceConfigModel.createFileConfig(config);
            }).toThrow(/filePath.*required/);
        });

        it('should validate file types', () => {
            const config: Partial<FileDataSourceConfig> = {
                filePath: './test-data',
                fileTypes: ['invalid-type'] as any
            };

            expect(() => {
                DataSourceConfigModel.createFileConfig(config);
            }).toThrow(/fileTypes/);
        });
    });

    describe('Database Data Source Configuration', () => {
        it('should create valid database data source config', () => {
            const config: Partial<DatabaseDataSourceConfig> = {
                connectionString: 'postgresql://user:pass@localhost:5432/db',
                table: 'documents',
                credentials: {
                    username: 'user',
                    password: 'pass'
                },
                syncInterval: 600
            };

            const configModel = DataSourceConfigModel.createDatabaseConfig(config);
            expect(configModel.type).toBe('database');
            expect(configModel.config.connectionString).toBe('postgresql://user:pass@localhost:5432/db');
            expect((configModel.config as DatabaseDataSourceConfig).table).toBe('documents');
        });

        it('should validate required connectionString for database config', () => {
            const config = {
                table: 'documents',
                credentials: {
                    username: 'user',
                    password: 'pass'
                }
            };

            expect(() => {
                DataSourceConfigModel.createDatabaseConfig(config);
            }).toThrow(/connectionString.*required/);
        });

        it('should validate required credentials for database config', () => {
            const config: Partial<DatabaseDataSourceConfig> = {
                connectionString: 'postgresql://localhost:5432/db',
                table: 'documents'
            };

            expect(() => {
                DataSourceConfigModel.createDatabaseConfig(config);
            }).toThrow(/credentials.*required/);
        });
    });

    describe('API Data Source Configuration', () => {
        it('should create valid API data source config', () => {
            const config: Partial<ApiDataSourceConfig> = {
                apiEndpoint: 'https://api.example.com/data',
                method: 'GET',
                credentials: {
                    apiKey: 'test-key'
                },
                headers: {
                    'Content-Type': 'application/json'
                },
                pagination: {
                    type: 'offset',
                    limitParam: 'limit',
                    offsetParam: 'offset'
                }
            };

            const configModel = DataSourceConfigModel.createApiConfig(config);
            expect(configModel.type).toBe('api');
            expect(configModel.config.apiEndpoint).toBe('https://api.example.com/data');
            expect((configModel.config as ApiDataSourceConfig).method).toBe('GET');
        });

        it('should validate required apiEndpoint for API config', () => {
            const config = {
                credentials: {
                    apiKey: 'test-key'
                }
            };

            expect(() => {
                DataSourceConfigModel.createApiConfig(config);
            }).toThrow(/apiEndpoint.*required/);
        });

        it('should validate API endpoint URL format', () => {
            const config: Partial<ApiDataSourceConfig> = {
                apiEndpoint: 'invalid-url',
                credentials: {
                    apiKey: 'test-key'
                }
            };

            expect(() => {
                DataSourceConfigModel.createApiConfig(config);
            }).toThrow(/must be a valid uri/);
        });

        it('should validate pagination configuration', () => {
            const config: Partial<ApiDataSourceConfig> = {
                apiEndpoint: 'https://api.example.com/data',
                credentials: {
                    apiKey: 'test-key'
                },
                pagination: {
                    type: 'cursor',
                    cursorParam: '' // Empty cursor param should trigger validation
                } as any
            };

            expect(() => {
                DataSourceConfigModel.createApiConfig(config);
            }).toThrow(/not allowed to be empty/);
        });
    });

    describe('Configuration Serialization', () => {
        it('should serialize and deserialize configuration', () => {
            const originalConfig: Partial<FileDataSourceConfig> = {
                filePath: './src/test/test-data',
                fileTypes: ['pdf', 'txt'],
                syncInterval: 300
            };

            const configModel = DataSourceConfigModel.createFileConfig(originalConfig);
            const serialized = configModel.toJSON();
            const deserialized = DataSourceConfigModel.fromJSON(serialized, 'file');

            expect(deserialized.config).toEqual(configModel.config);
            expect(deserialized.type).toBe(configModel.type);
        });
    });

    describe('Configuration Sanitization', () => {
        it('should sanitize string values', () => {
            const config = {
                filePath: '  ./src/test/test-data  ',
                syncInterval: 300
            };

            const configModel = DataSourceConfigModel.createFileConfig(config);
            expect(configModel.config.filePath).toBe('./src/test/test-data');
        });

        it('should enforce minimum values', () => {
            const config: Partial<FileDataSourceConfig> = {
                filePath: './src/test/test-data',
                syncInterval: 30, // Below minimum of 60
                batchSize: 0, // Below minimum of 1
                timeout: 500 // Below minimum of 1000
            };

            const configModel = DataSourceConfigModel.createFileConfig(config);
            expect(configModel.config.syncInterval).toBe(60);
            expect(configModel.config.batchSize).toBe(1);
            expect(configModel.config.timeout).toBe(1000);
        });
    });
});