import { SystemConfig } from '../models/config';
import { loadFromEnv } from './env';
import { loadFromFile } from './file';
import { validateConfig } from './validation';

export class ConfigManager {
    private static instance: ConfigManager;
    private config: SystemConfig | null = null;

    private constructor() { }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    public async loadConfig(configPath?: string): Promise<SystemConfig> {
        try {
            // Load configuration from file if path provided, otherwise from environment
            const rawConfig = configPath
                ? await loadFromFile(configPath)
                : loadFromEnv();

            // Validate configuration
            const validatedConfig = validateConfig(rawConfig);

            this.config = validatedConfig;
            return this.config;
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public getConfig(): SystemConfig {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        return this.config;
    }

    public updateConfig(updates: Partial<SystemConfig>): void {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }

        this.config = { ...this.config, ...updates };
        validateConfig(this.config);
    }

    public reloadConfig(configPath?: string): Promise<SystemConfig> {
        this.config = null;
        return this.loadConfig(configPath);
    }
}

export * from './configManager';
export * from './defaults';
export * from './env';
export * from './envValidator';
export * from './file';
export * from './validation';

