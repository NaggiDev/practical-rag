import { EnhancedConfigManager } from './configManager';
import { defaultConfig } from './defaults';
import { envValidator } from './envValidator';
import { ConfigManager } from './index';
import { ConfigTemplateManager } from './templates';

describe('ConfigManager', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
        configManager = ConfigManager.getInstance();
    });

    describe('Basic Configuration Loading', () => {
        it('should load default configuration', async () => {
            const config = await configManager.loadConfig();

            expect(config).toBeDefined();
            expect(config.server.port).toBe(defaultConfig.server.port);
            expect(config.database.vector.provider).toBe(defaultConfig.database.vector.provider);
            expect(config.embedding.provider).toBe(defaultConfig.embedding.provider);
        });

        it('should validate configuration', async () => {
            const config = await configManager.loadConfig();

            // Should not throw for valid config
            expect(() => configManager.updateConfig(config)).not.toThrow();
        });

        it('should throw error for invalid configuration', async () => {
            await configManager.loadConfig();

            // Should throw for invalid port
            expect(() => {
                configManager.updateConfig({
                    server: {
                        ...defaultConfig.server,
                        port: -1 // Invalid port
                    }
                } as any);
            }).toThrow();
        });

        it('should reload configuration', async () => {
            const config1 = await configManager.loadConfig();
            const config2 = await configManager.reloadConfig();

            expect(config1).toEqual(config2);
        });
    });
});

describe('EnhancedConfigManager', () => {
    let configManager: EnhancedConfigManager;

    beforeEach(() => {
        configManager = EnhancedConfigManager.getInstance();
    });

    afterEach(() => {
        configManager.destroy();
    });

    describe('Basic Functionality', () => {
        it('should load configuration with options', async () => {
            const config = await configManager.loadConfig({
                environment: 'development',
                validateOnLoad: true
            });

            expect(config).toBeDefined();
            expect(config.server).toBeDefined();
            expect(config.database).toBeDefined();
        });

        it('should get current environment', async () => {
            await configManager.loadConfig({ environment: 'test' });

            expect(configManager.getCurrentEnvironment()).toBe('test');
        });

        it('should provide configuration summary', async () => {
            await configManager.loadConfig({ environment: 'test' });

            const summary = configManager.getConfigSummary();

            expect(summary).toHaveProperty('environment', 'test');
            expect(summary).toHaveProperty('watchForChanges');
            expect(summary).toHaveProperty('dataSources');
            expect(summary).toHaveProperty('validationStatus');
        });

        it('should get environment variables', () => {
            const envVars = configManager.getEnvironmentVariables();

            expect(envVars).toHaveProperty('PORT');
            expect(envVars).toHaveProperty('HOST');
            expect(envVars).toHaveProperty('VECTOR_DB_PROVIDER');
        });

        it('should validate environment variables', () => {
            const result = configManager.validateEnvironmentVariables();

            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('errors');
            expect(Array.isArray(result.errors)).toBe(true);
        });
    });

    describe('Data Source Management', () => {
        it('should validate data source configuration', async () => {
            await configManager.loadConfig();

            const validConfig = {
                connectionString: 'postgresql://localhost:5432/test',
                syncInterval: 3600,
                credentials: { username: 'test', password: 'test' }
            };

            const invalidConfig = {
                syncInterval: -1 // Invalid
            };

            expect(configManager.validateDataSourceConfig(validConfig, 'database')).toBe(true);
            expect(configManager.validateDataSourceConfig(invalidConfig, 'database')).toBe(false);
        });
    });
});

describe('EnvironmentValidator', () => {
    it('should validate environment variables', () => {
        const result = envValidator.validateEnvironment();

        expect(result).toHaveProperty('valid');
        expect(result).toHaveProperty('errors');
        expect(result).toHaveProperty('warnings');
        expect(result).toHaveProperty('sanitizedEnv');
    });

    it('should get validated environment', () => {
        const env = envValidator.getValidatedEnvironment();

        expect(env).toHaveProperty('PORT');
        expect(env).toHaveProperty('HOST');
    });

    it('should check environment types', () => {
        expect(typeof envValidator.isProduction()).toBe('boolean');
        expect(typeof envValidator.isDevelopment()).toBe('boolean');
        expect(typeof envValidator.isTest()).toBe('boolean');
    });

    it('should generate environment template', () => {
        const template = envValidator.generateEnvTemplate();

        expect(template).toContain('PORT=');
        expect(template).toContain('HOST=');
        expect(template).toContain('VECTOR_DB_PROVIDER=');
        expect(template).toContain('# Fast RAG System Configuration');
    });
});

describe('ConfigTemplateManager', () => {
    it('should get available templates', () => {
        const templates = ConfigTemplateManager.getAvailableTemplates();

        expect(Array.isArray(templates)).toBe(true);
        expect(templates.length).toBeGreaterThan(0);
        expect(templates).toContain('development');
        expect(templates).toContain('production');
    });

    it('should get template by name', () => {
        const template = ConfigTemplateManager.getTemplate('development');

        expect(template).toBeDefined();
        expect(template?.name).toBe('Development');
        expect(template?.config).toBeDefined();
    });

    it('should generate config from template', () => {
        const config = ConfigTemplateManager.generateConfig('development');

        expect(config).toBeDefined();
        expect(config.server).toBeDefined();
        expect(config.database).toBeDefined();
        expect(config.cache).toBeDefined();
    });

    it('should generate config with overrides', () => {
        const overrides = {
            server: {
                ...defaultConfig.server,
                port: 9999
            }
        };

        const config = ConfigTemplateManager.generateConfig('development', overrides);

        expect(config.server.port).toBe(9999);
    });

    it('should create custom template', () => {
        const customConfig = {
            server: {
                ...defaultConfig.server,
                port: 5555
            }
        };

        ConfigTemplateManager.createCustomTemplate('custom', 'Custom template', customConfig);

        const template = ConfigTemplateManager.getTemplate('custom');
        expect(template).toBeDefined();
        expect(template?.name).toBe('custom');
        expect(template?.description).toBe('Custom template');
    });

    it('should export template', () => {
        const exported = ConfigTemplateManager.exportTemplate('development');

        expect(typeof exported).toBe('string');
        expect(() => JSON.parse(exported)).not.toThrow();
    });

    it('should import template', () => {
        const templateData = JSON.stringify({
            name: 'Test Template',
            description: 'Test description',
            config: { server: { port: 8888 } }
        });

        const imported = ConfigTemplateManager.importTemplate(templateData);

        expect(imported.name).toBe('Test Template');
        expect(imported.description).toBe('Test description');
        expect(imported.config).toBeDefined();
    });

    it('should throw error for invalid template import', () => {
        const invalidData = '{"invalid": true}';

        expect(() => {
            ConfigTemplateManager.importTemplate(invalidData);
        }).toThrow();
    });
});