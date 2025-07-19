import { defaultConfig } from './defaults';
import { ConfigManager } from './index';

describe('ConfigManager', () => {
    let configManager: ConfigManager;

    beforeEach(() => {
        configManager = ConfigManager.getInstance();
    });

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
});