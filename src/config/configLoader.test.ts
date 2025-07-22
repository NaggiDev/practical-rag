import * as fs from 'fs';
import * as path from 'path';
import { ConfigLoader } from './configLoader';
import { defaultConfig } from './defaults';

describe('ConfigLoader', () => {
    const testConfigDir = path.join(__dirname, '../../test-config-loader');
    let configLoader: ConfigLoader;

    beforeEach(() => {
        // Create test config directory if it doesn't exist
        if (!fs.existsSync(testConfigDir)) {
            fs.mkdirSync(testConfigDir, { recursive: true });
        }

        // Create a new instance for each test
        configLoader = new ConfigLoader({
            configDir: testConfigDir,
            environment: 'test',
            watchForChanges: false
        });
    });

    afterEach(() => {
        // Clean up
        configLoader.destroy();

        // Remove test config directory
        if (fs.existsSync(testConfigDir)) {
            fs.rmSync(testConfigDir, { recursive: true, force: true });
        }
    });

    describe('Configuration Loading', () => {
        it('should load default configuration when no files exist', async () => {
            const config = await configLoader.loadConfig();

            expect(config).toBeDefined();
            expect(config.server.port).toBe(defaultConfig.server.port);
            expect(config.database.vector.provider).toBe(defaultConfig.database.vector.provider);
        });

        it('should load configuration from base config file', async () => {
            // Create base config file
            const baseConfig = {
                server: {
                    port: 8080
                }
            };
            fs.writeFileSync(
                path.join(testConfigDir, 'config.json'),
                JSON.stringify(baseConfig),
                'utf8'
            );

            const config = await configLoader.loadConfig();

            expect(config.server.port).toBe(8080);
        });

        it('should load configuration from environment-specific file', async () => {
            // Create base config file
            const baseConfig = {
                server: {
                    port: 8080
                }
            };
            fs.writeFileSync(
                path.join(testConfigDir, 'config.json'),
                JSON.stringify(baseConfig),
                'utf8'
            );

            // Create environment-specific config file
            const envConfig = {
                server: {
                    port: 9090
                }
            };
            fs.writeFileSync(
                path.join(testConfigDir, 'config.test.json'),
                JSON.stringify(envConfig),
                'utf8'
            );

            const config = await configLoader.loadConfig();

            // Environment-specific config should override base config
            expect(config.server.port).toBe(9090);
        });

        it('should merge with environment variables if requested', async () => {
            // Save original env var
            const originalPort = process.env.PORT;

            // Set env var
            process.env.PORT = '7070';

            // Create loader with mergeWithEnv=true
            const envLoader = new ConfigLoader({
                configDir: testConfigDir,
                environment: 'test',
                mergeWithEnv: true
            });

            const config = await envLoader.loadConfig();

            // Env var should override default
            expect(config.server.port).toBe(7070);

            // Restore original env var
            if (originalPort === undefined) {
                delete process.env.PORT;
            } else {
                process.env.PORT = originalPort;
            }
        });
    });

    describe('Configuration Management', () => {
        it('should get loaded configuration', async () => {
            await configLoader.loadConfig();
            const config = configLoader.getConfig();

            expect(config).toBeDefined();
            expect(config.server).toBeDefined();
        });

        it('should throw error when getting config before loading', () => {
            expect(() => configLoader.getConfig()).toThrow('Configuration not loaded');
        });

        it('should reload configuration', async () => {
            await configLoader.loadConfig();

            // Create environment-specific config file after initial load
            const envConfig = {
                server: {
                    port: 9999
                }
            };
            fs.writeFileSync(
                path.join(testConfigDir, 'config.test.json'),
                JSON.stringify(envConfig),
                'utf8'
            );

            // Reload config
            const reloadedConfig = await configLoader.reloadConfig();

            // Should pick up the new file
            expect(reloadedConfig.server.port).toBe(9999);
        });

        it('should save configuration to file', async () => {
            await configLoader.loadConfig();

            const config = {
                ...defaultConfig,
                server: {
                    ...defaultConfig.server,
                    port: 8888
                }
            };

            const savePath = await configLoader.saveConfig(config);

            expect(fs.existsSync(savePath)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(savePath, 'utf8'));
            expect(savedData.server.port).toBe(8888);
        });
    });

    describe('Environment Management', () => {
        it('should get current environment', async () => {
            await configLoader.loadConfig();
            expect(configLoader.getEnvironment()).toBe('test');
        });

        it('should switch environments', async () => {
            await configLoader.loadConfig();

            // Create a production config
            const prodConfig = {
                server: {
                    port: 8080
                }
            };
            fs.writeFileSync(
                path.join(testConfigDir, 'config.production.json'),
                JSON.stringify(prodConfig),
                'utf8'
            );

            // Switch to production
            const switchedConfig = await configLoader.switchEnvironment('production');

            expect(configLoader.getEnvironment()).toBe('production');
            expect(switchedConfig.server.port).toBe(8080);
        });

        it('should get available environments', async () => {
            // Create configs for multiple environments
            fs.writeFileSync(
                path.join(testConfigDir, 'config.development.json'),
                JSON.stringify({}),
                'utf8'
            );
            fs.writeFileSync(
                path.join(testConfigDir, 'config.production.json'),
                JSON.stringify({}),
                'utf8'
            );
            fs.writeFileSync(
                path.join(testConfigDir, 'config.staging.json'),
                JSON.stringify({}),
                'utf8'
            );

            await configLoader.loadConfig();
            const environments = await configLoader.getAvailableEnvironments();

            expect(environments).toContain('development');
            expect(environments).toContain('production');
            expect(environments).toContain('staging');
        });

        it('should create environment config', async () => {
            await configLoader.loadConfig();

            const config = {
                ...defaultConfig,
                server: {
                    ...defaultConfig.server,
                    port: 7777
                }
            };

            const configPath = await configLoader.createEnvironmentConfig('staging', config);

            expect(fs.existsSync(configPath)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            expect(savedData.server.port).toBe(7777);
        });
    });

    describe('Configuration Change Events', () => {
        it('should notify listeners of configuration changes', (done) => {
            // Create loader with watch enabled
            const watchLoader = new ConfigLoader({
                configDir: testConfigDir,
                environment: 'test',
                watchForChanges: true
            });

            watchLoader.loadConfig().then(() => {
                // Register change listener
                watchLoader.onConfigChange((config) => {
                    expect(config.server.port).toBe(5555);
                    watchLoader.destroy();
                    done();
                });

                // Create config file to trigger change
                const newConfig = {
                    server: {
                        port: 5555
                    }
                };
                fs.writeFileSync(
                    path.join(testConfigDir, 'config.test.json'),
                    JSON.stringify(newConfig),
                    'utf8'
                );
            });
        });

        it('should remove configuration change listener', async () => {
            // Create loader with watch enabled
            const watchLoader = new ConfigLoader({
                configDir: testConfigDir,
                environment: 'test',
                watchForChanges: true
            });

            await watchLoader.loadConfig();

            const listener = jest.fn();
            watchLoader.onConfigChange(listener);

            // Remove the listener
            watchLoader.removeConfigChangeListener(listener);

            // Create config file to trigger change
            const newConfig = {
                server: {
                    port: 6666
                }
            };
            fs.writeFileSync(
                path.join(testConfigDir, 'config.test.json'),
                JSON.stringify(newConfig),
                'utf8'
            );

            // Wait a bit to ensure file watcher has time to trigger
            await new Promise(resolve => setTimeout(resolve, 500));

            expect(listener).not.toHaveBeenCalled();
            watchLoader.destroy();
        });
    });
});