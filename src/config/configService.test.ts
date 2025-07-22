import * as fs from 'fs';
import * as path from 'path';
import { ConfigService } from './configService';
import { defaultConfig } from './defaults';

describe('ConfigService', () => {
    const testConfigDir = path.join(__dirname, '../../test-config');
    let configService: ConfigService;

    beforeEach(() => {
        // Create test config directory if it doesn't exist
        if (!fs.existsSync(testConfigDir)) {
            fs.mkdirSync(testConfigDir, { recursive: true });
        }

        // Create a new instance for each test
        configService = ConfigService.getInstance({
            configDir: testConfigDir,
            environment: 'test',
            validateConfig: true,
            watchForChanges: false
        });
    });

    afterEach(() => {
        // Clean up
        configService.destroy();

        // Remove test config directory
        if (fs.existsSync(testConfigDir)) {
            fs.rmSync(testConfigDir, { recursive: true, force: true });
        }
    });

    describe('Basic Configuration Management', () => {
        it('should initialize with default configuration', async () => {
            const config = await configService.initialize();

            expect(config).toBeDefined();
            expect(config.server.port).toBe(defaultConfig.server.port);
            expect(config.database.vector.provider).toBe(defaultConfig.database.vector.provider);
        });

        it('should get configuration after initialization', async () => {
            await configService.initialize();
            const config = configService.getConfig();

            expect(config).toBeDefined();
            expect(config.server).toBeDefined();
            expect(config.database).toBeDefined();
        });

        it('should throw error when getting config before initialization', () => {
            expect(() => configService.getConfig()).toThrow('Configuration not initialized');
        });

        it('should update configuration', async () => {
            await configService.initialize();

            const updatedConfig = configService.updateConfig({
                server: {
                    ...defaultConfig.server,
                    port: 8080
                }
            });

            expect(updatedConfig.server.port).toBe(8080);
            expect(configService.getConfig().server.port).toBe(8080);
        });

        it('should reload configuration', async () => {
            await configService.initialize();

            // Update config
            configService.updateConfig({
                server: {
                    ...defaultConfig.server,
                    port: 8080
                }
            });

            // Reload config (should reset to default)
            const reloadedConfig = await configService.reloadConfig();

            // Should be back to default
            expect(reloadedConfig.server.port).toBe(defaultConfig.server.port);
        });
    });

    describe('Environment-Specific Configuration', () => {
        it('should get current environment', async () => {
            await configService.initialize({ environment: 'development' });
            expect(configService.getEnvironment()).toBe('development');
        });

        it('should switch environments', async () => {
            await configService.initialize({ environment: 'development' });

            // Create a production config
            await configService.createEnvironmentConfig('production');

            // Switch to production
            const prodConfig = await configService.switchEnvironment('production');

            expect(configService.getEnvironment()).toBe('production');
            expect(prodConfig).toBeDefined();
        });

        it('should get available environments', async () => {
            await configService.initialize({ environment: 'development' });

            // Create additional environments
            await configService.createEnvironmentConfig('production');
            await configService.createEnvironmentConfig('staging');

            const environments = await configService.getAvailableEnvironments();

            expect(environments).toContain('development');
            expect(environments).toContain('production');
            expect(environments).toContain('staging');
        });

        it('should create environment config from template', async () => {
            await configService.initialize();

            const configPath = await configService.createEnvironmentConfig('production', 'production');

            expect(fs.existsSync(configPath)).toBe(true);

            // Switch to the new environment
            const prodConfig = await configService.switchEnvironment('production');

            // Should have production template values
            expect(prodConfig.server.port).toBe(8080);
        });
    });

    describe('Configuration Import/Export', () => {
        it('should export configuration to file', async () => {
            await configService.initialize();

            const exportPath = await configService.exportConfig(path.join(testConfigDir, 'exported-config.json'));

            expect(fs.existsSync(exportPath)).toBe(true);

            const exportedData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
            expect(exportedData.server).toBeDefined();
            expect(exportedData.database).toBeDefined();
        });

        it('should import configuration from file', async () => {
            await configService.initialize();

            // Create a custom config file
            const customConfig = {
                ...defaultConfig,
                server: {
                    ...defaultConfig.server,
                    port: 9999
                }
            };

            const importPath = path.join(testConfigDir, 'import-config.json');
            fs.writeFileSync(importPath, JSON.stringify(customConfig), 'utf8');

            // Import the config
            const importedConfig = await configService.importConfig(importPath);

            expect(importedConfig.server.port).toBe(9999);
            expect(configService.getConfig().server.port).toBe(9999);
        });
    });

    describe('Configuration Change Events', () => {
        it('should notify listeners of configuration changes', async () => {
            await configService.initialize();

            const listener = jest.fn();
            configService.onConfigChange(listener);

            // Update config to trigger change event
            configService.updateConfig({
                server: {
                    ...defaultConfig.server,
                    port: 8888
                }
            });

            expect(listener).toHaveBeenCalled();
            const listenerArg = listener.mock.calls[0][0];
            expect(listenerArg.server.port).toBe(8888);
        });

        it('should remove configuration change listener', async () => {
            await configService.initialize();

            const listener = jest.fn();
            configService.onConfigChange(listener);

            // Remove the listener
            configService.removeConfigChangeListener(listener);

            // Update config
            configService.updateConfig({
                server: {
                    ...defaultConfig.server,
                    port: 7777
                }
            });

            expect(listener).not.toHaveBeenCalled();
        });
    });
});