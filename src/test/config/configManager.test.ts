import * as fs from 'fs';
import * as path from 'path';
import { EnhancedConfigManager } from '../../config/configManager';
import { SystemConfig } from '../../models/config';

describe('EnhancedConfigManager', () => {
    let configManager: EnhancedConfigManager;
    let tempConfigPath: string;

    beforeEach(() => {
        configManager = EnhancedConfigManager.getInstance();
        tempConfigPath = path.join(__dirname, 'temp-config.json');

        // Reset environment variables to clean state
        process.env.PORT = '3000';
        process.env.HOST = '0.0.0.0';
        process.env.NODE_ENV = 'test';
    });

    afterEach(() => {
        // Clean up temp files
        if (fs.existsSync(tempConfigPath)) {
            fs.unlinkSync(tempConfigPath);
        }
        configManager.destroy();
    });

    describe('Configuration Loading', () => {
        it('should load configuration from environment variables', async () => {
            // Set test environment variables
            process.env.PORT = '4000';
            process.env.REDIS_HOST = 'test-redis';

            const config = await configManager.loadConfig();

            expect(config.server.port).toBe(4000);
            expect(config.cache.redis.host).toBe('test-redis');
        });

        it('should load configuration from file', async () => {
            const testConfig: Partial<SystemConfig> = {
                server: {
                    port: 5000,
                    host: 'test-host',
                    cors: { enabled: true, origins: ['http://localhost'] },
                    rateLimit: { windowMs: 60000, maxRequests: 100 },
                    timeout: 30000
                }
            };

            fs.writeFileSync(tempConfigPath, JSON.stringify(testConfig, null, 2));

            const config = await configManager.loadConfig({ configPath: tempConfigPath });

            expect(config.server.port).toBe(5000);
            expect(config.server.host).toBe('test-host');
        });

        it('should merge configuration with defaults', async () => {
            const partialConfig = {
                server: {
                    port: 6000
                }
            };

            fs.writeFileSync(tempConfigPath, JSON.stringify(partialConfig, null, 2));

            const config = await configManager.loadConfig({ configPath: tempConfigPath });

            expect(config.server.port).toBe(6000);
            expect(config.server.host).toBe('0.0.0.0'); // Default value
            expect(config.cache.redis.host).toBe('localhost'); // Default value
        });
    });

    describe('Configuration Updates', () => {
        beforeEach(async () => {
            await configManager.loadConfig();
        });

        it('should update configuration', () => {
            const updates: Partial<SystemConfig> = {
                server: {
                    port: 7000,
                    host: 'updated-host',
                    cors: { enabled: false, origins: [] },
                    rateLimit: { windowMs: 60000, maxRequests: 100 },
                    timeout: 30000
                }
            };

            configManager.updateConfig(updates);

            const config = configManager.getConfig();
            expect(config.server.port).toBe(7000);
            expect(config.server.host).toBe('updated-host');
            expect(config.server.cors.enabled).toBe(false);
        });

        it('should validate configuration updates', () => {
            const invalidUpdates = {
                server: {
                    port: -1 // Invalid port
                }
            };

            expect(() => {
                configManager.updateConfig(invalidUpdates as any);
            }).toThrow(/validation failed/);
        });
    });

    describe('Data Source Management', () => {
        beforeEach(async () => {
            await configManager.loadConfig();
        });

        it('should add valid file data source', () => {
            const fileConfig = {
                filePath: './src/test/test-data',
                fileTypes: ['pdf', 'txt'],
                syncInterval: 300
            };

            configManager.addDataSource(fileConfig, 'file');

            const config = configManager.getConfig();
            expect(config.dataSources).toHaveLength(1);
            expect(config.dataSources[0]?.filePath).toBe('./src/test/test-data');
        });

        it('should add valid database data source', () => {
            const dbConfig = {
                connectionString: 'postgresql://user:pass@localhost:5432/db',
                table: 'documents',
                credentials: {
                    username: 'user',
                    password: 'pass'
                }
            };

            configManager.addDataSource(dbConfig, 'database');

            const config = configManager.getConfig();
            expect(config.dataSources).toHaveLength(1);
            expect(config.dataSources[0]?.connectionString).toBe('postgresql://user:pass@localhost:5432/db');
        });

        it('should add valid API data source', () => {
            const apiConfig = {
                apiEndpoint: 'https://api.example.com/data',
                credentials: {
                    apiKey: 'test-key'
                }
            };

            configManager.addDataSource(apiConfig, 'api');

            const config = configManager.getConfig();
            expect(config.dataSources).toHaveLength(1);
            expect(config.dataSources[0]?.apiEndpoint).toBe('https://api.example.com/data');
        });

        it('should reject invalid data source configuration', () => {
            const invalidConfig = {
                // Missing required fields
            };

            expect(() => {
                configManager.addDataSource(invalidConfig, 'file');
            }).toThrow(/validation failed/);
        });

        it('should remove data source by index', () => {
            const fileConfig = {
                filePath: './src/test/test-data',
                syncInterval: 300
            };

            configManager.addDataSource(fileConfig, 'file');
            expect(configManager.getConfig().dataSources).toHaveLength(1);

            configManager.removeDataSource(0);
            expect(configManager.getConfig().dataSources).toHaveLength(0);
        });
    });

    describe('Environment Variable Handling', () => {
        it('should get environment variables', () => {
            process.env.PORT = '8000';
            process.env.REDIS_HOST = 'env-redis';

            const envVars = configManager.getEnvironmentVariables();

            expect(envVars.PORT).toBe('8000');
            expect(envVars.REDIS_HOST).toBe('env-redis');
        });

        it('should validate environment variables', () => {
            // Set valid environment variables
            process.env.PORT = '9000';
            process.env.HOST = 'localhost';

            const result = configManager.validateEnvironmentVariables();

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should detect invalid environment variables', () => {
            // Set invalid environment variables
            process.env.PORT = 'invalid-port';

            const result = configManager.validateEnvironmentVariables();

            expect(result.valid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Configuration Validation', () => {
        beforeEach(async () => {
            await configManager.loadConfig();
        });

        it('should validate data source configuration', () => {
            const validFileConfig = {
                filePath: './src/test/test-data',
                syncInterval: 300
            };

            const isValid = configManager.validateDataSourceConfig(validFileConfig, 'file');
            expect(isValid).toBe(true);
        });

        it('should reject invalid data source configuration', () => {
            const invalidFileConfig = {
                // Missing required filePath
                syncInterval: 300
            };

            const isValid = configManager.validateDataSourceConfig(invalidFileConfig, 'file');
            expect(isValid).toBe(false);
        });
    });

    describe('Configuration Persistence', () => {
        beforeEach(async () => {
            await configManager.loadConfig();
        });

        it('should save configuration to file', async () => {
            await configManager.saveConfig(tempConfigPath);

            expect(fs.existsSync(tempConfigPath)).toBe(true);

            const savedConfig = JSON.parse(fs.readFileSync(tempConfigPath, 'utf8'));
            expect(savedConfig.server).toBeDefined();
            expect(savedConfig.database).toBeDefined();
        });
    });

    describe('Change Listeners', () => {
        beforeEach(async () => {
            await configManager.loadConfig();
        });

        it('should notify change listeners', (done) => {
            const listener = (config: SystemConfig) => {
                expect(config.server.port).toBe(10000);
                done();
            };

            configManager.onConfigChange(listener);

            configManager.updateConfig({
                server: {
                    port: 10000,
                    host: '0.0.0.0',
                    cors: { enabled: true, origins: ['*'] },
                    rateLimit: { windowMs: 60000, maxRequests: 100 },
                    timeout: 30000
                }
            });
        });

        it('should remove change listeners', () => {
            const listener = jest.fn();

            configManager.onConfigChange(listener);
            configManager.removeConfigChangeListener(listener);

            configManager.updateConfig({
                server: {
                    port: 11000,
                    host: '0.0.0.0',
                    cors: { enabled: true, origins: ['*'] },
                    rateLimit: { windowMs: 60000, maxRequests: 100 },
                    timeout: 30000
                }
            });

            expect(listener).not.toHaveBeenCalled();
        });
    });
});