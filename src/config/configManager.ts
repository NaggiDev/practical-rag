import * as fs from 'fs';
import { SystemConfig, SystemConfigModel } from '../models/config';
import { DataSourceConfigModel } from '../models/dataSource';
import { defaultConfig } from './defaults';
import { loadFromEnv } from './env';
import { loadFromFile } from './file';
import { validateConfig } from './validation';

export interface ConfigManagerOptions {
    configPath?: string;
    envPrefix?: string;
    watchForChanges?: boolean;
    validateOnLoad?: boolean;
}

export class EnhancedConfigManager {
    private static instance: EnhancedConfigManager;
    private config: SystemConfigModel | null = null;
    private configPath?: string;
    private watchForChanges: boolean = false;
    private fileWatcher?: fs.FSWatcher;
    private changeListeners: Array<(config: SystemConfig) => void> = [];

    private constructor() { }

    public static getInstance(): EnhancedConfigManager {
        if (!EnhancedConfigManager.instance) {
            EnhancedConfigManager.instance = new EnhancedConfigManager();
        }
        return EnhancedConfigManager.instance;
    }

    public async loadConfig(options: ConfigManagerOptions = {}): Promise<SystemConfig> {
        try {
            this.configPath = options.configPath;
            this.watchForChanges = options.watchForChanges || false;

            // Load configuration from file if path provided, otherwise from environment
            const rawConfig = this.configPath
                ? await loadFromFile(this.configPath)
                : loadFromEnv();

            // Merge with defaults
            const mergedConfig = this.mergeWithDefaults(rawConfig);

            // Validate configuration if requested
            const validatedConfig = options.validateOnLoad !== false
                ? validateConfig(mergedConfig)
                : mergedConfig;

            // Create SystemConfigModel instance
            this.config = new SystemConfigModel(validatedConfig);

            // Set up file watching if requested
            if (this.watchForChanges && this.configPath) {
                this.setupFileWatcher();
            }

            return this.config.toJSON();
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    public getConfig(): SystemConfig {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        return this.config.toJSON();
    }

    public updateConfig(updates: Partial<SystemConfig>): void {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }

        const currentConfig = this.config.toJSON();
        const updatedConfig = { ...currentConfig, ...updates };

        // Validate the updated configuration
        const validatedConfig = validateConfig(updatedConfig);

        this.config = new SystemConfigModel(validatedConfig);

        // Notify listeners
        this.notifyChangeListeners(this.config.toJSON());
    }

    public async reloadConfig(options?: ConfigManagerOptions): Promise<SystemConfig> {
        this.cleanup();
        this.config = null;
        return this.loadConfig(options || { configPath: this.configPath, watchForChanges: this.watchForChanges });
    }

    public addDataSource(dataSourceConfig: any, type: 'file' | 'database' | 'api'): void {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }

        // Validate the data source configuration using type-specific validation
        const validatedConfig = new DataSourceConfigModel(dataSourceConfig, type);

        const currentConfig = this.config.toJSON();
        const updatedDataSources = [...currentConfig.dataSources, validatedConfig.config];

        this.updateConfig({ dataSources: updatedDataSources });
    }

    public removeDataSource(index: number): void {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }

        const currentConfig = this.config.toJSON();
        if (index < 0 || index >= currentConfig.dataSources.length) {
            throw new Error(`Invalid data source index: ${index}`);
        }

        const updatedDataSources = currentConfig.dataSources.filter((_, i) => i !== index);
        this.updateConfig({ dataSources: updatedDataSources });
    }

    public validateDataSourceConfig(config: any, type: 'file' | 'database' | 'api'): boolean {
        try {
            new DataSourceConfigModel(config, type);
            return true;
        } catch {
            return false;
        }
    }

    public getEnvironmentVariables(): Record<string, string> {
        const envVars: Record<string, string> = {};

        // Server configuration
        envVars.PORT = process.env.PORT || '3000';
        envVars.HOST = process.env.HOST || '0.0.0.0';
        envVars.CORS_ENABLED = process.env.CORS_ENABLED || 'true';
        envVars.CORS_ORIGINS = process.env.CORS_ORIGINS || '*';

        // Database configuration
        envVars.VECTOR_DB_PROVIDER = process.env.VECTOR_DB_PROVIDER || 'faiss';
        envVars.VECTOR_DB_CONNECTION_STRING = process.env.VECTOR_DB_CONNECTION_STRING || '';
        envVars.VECTOR_DB_API_KEY = process.env.VECTOR_DB_API_KEY || '';
        envVars.VECTOR_DB_INDEX_NAME = process.env.VECTOR_DB_INDEX_NAME || 'default-index';
        envVars.VECTOR_DB_DIMENSION = process.env.VECTOR_DB_DIMENSION || '384';

        // Cache configuration
        envVars.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
        envVars.REDIS_PORT = process.env.REDIS_PORT || '6379';
        envVars.REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
        envVars.REDIS_DB = process.env.REDIS_DB || '0';

        // Embedding configuration
        envVars.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'sentence-transformers';
        envVars.EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2';
        envVars.EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || '';
        envVars.EMBEDDING_DIMENSION = process.env.EMBEDDING_DIMENSION || '384';

        return envVars;
    }

    public validateEnvironmentVariables(): { valid: boolean; errors: string[] } {
        const errors: string[] = [];
        const envVars = this.getEnvironmentVariables();

        // Validate required environment variables
        const requiredVars = ['PORT', 'HOST'];
        for (const varName of requiredVars) {
            if (!envVars[varName]) {
                errors.push(`Missing required environment variable: ${varName}`);
            }
        }

        // Validate numeric values
        const numericVars = ['PORT', 'REDIS_PORT', 'VECTOR_DB_DIMENSION', 'EMBEDDING_DIMENSION'];
        for (const varName of numericVars) {
            if (envVars[varName] && isNaN(Number(envVars[varName]))) {
                errors.push(`Environment variable ${varName} must be a number`);
            }
        }

        // Validate boolean values
        const booleanVars = ['CORS_ENABLED'];
        for (const varName of booleanVars) {
            if (envVars[varName] && !['true', 'false'].includes(envVars[varName].toLowerCase())) {
                errors.push(`Environment variable ${varName} must be 'true' or 'false'`);
            }
        }

        return { valid: errors.length === 0, errors };
    }

    public async saveConfig(filePath?: string): Promise<void> {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }

        const targetPath = filePath || this.configPath;
        if (!targetPath) {
            throw new Error('No file path specified for saving configuration');
        }

        try {
            const configData = JSON.stringify(this.config.toJSON(), null, 2);
            await fs.promises.writeFile(targetPath, configData, 'utf8');
        } catch (error) {
            throw new Error(`Failed to save configuration to ${targetPath}: ${error}`);
        }
    }

    public onConfigChange(listener: (config: SystemConfig) => void): void {
        this.changeListeners.push(listener);
    }

    public removeConfigChangeListener(listener: (config: SystemConfig) => void): void {
        const index = this.changeListeners.indexOf(listener);
        if (index > -1) {
            this.changeListeners.splice(index, 1);
        }
    }

    private mergeWithDefaults(config: Partial<SystemConfig>): SystemConfig {
        return {
            server: { ...defaultConfig.server, ...config.server },
            database: {
                vector: { ...defaultConfig.database.vector, ...config.database?.vector },
                metadata: { ...defaultConfig.database.metadata, ...config.database?.metadata }
            },
            cache: {
                redis: { ...defaultConfig.cache.redis, ...config.cache?.redis },
                ttl: { ...defaultConfig.cache.ttl, ...config.cache?.ttl },
                maxMemory: config.cache?.maxMemory || defaultConfig.cache.maxMemory,
                evictionPolicy: config.cache?.evictionPolicy || defaultConfig.cache.evictionPolicy
            },
            embedding: { ...defaultConfig.embedding, ...config.embedding },
            search: {
                ...defaultConfig.search,
                ...config.search,
                hybridSearch: { ...defaultConfig.search.hybridSearch, ...config.search?.hybridSearch },
                reranking: { ...defaultConfig.search.reranking, ...config.search?.reranking }
            },
            monitoring: {
                metrics: { ...defaultConfig.monitoring.metrics, ...config.monitoring?.metrics },
                logging: { ...defaultConfig.monitoring.logging, ...config.monitoring?.logging },
                healthCheck: { ...defaultConfig.monitoring.healthCheck, ...config.monitoring?.healthCheck }
            },
            dataSources: config.dataSources || defaultConfig.dataSources
        };
    }

    private setupFileWatcher(): void {
        if (!this.configPath) return;

        try {
            this.fileWatcher = fs.watch(this.configPath, async (eventType) => {
                if (eventType === 'change') {
                    try {
                        await this.reloadConfig();
                    } catch (error) {
                        console.error('Failed to reload configuration:', error);
                    }
                }
            });
        } catch (error) {
            console.warn('Failed to set up file watcher:', error);
        }
    }

    private notifyChangeListeners(config: SystemConfig): void {
        for (const listener of this.changeListeners) {
            try {
                listener(config);
            } catch (error) {
                console.error('Error in config change listener:', error);
            }
        }
    }

    private cleanup(): void {
        if (this.fileWatcher) {
            this.fileWatcher.close();
            this.fileWatcher = undefined;
        }
    }

    public destroy(): void {
        this.cleanup();
        this.changeListeners = [];
        this.config = null;
        EnhancedConfigManager.instance = null as any;
    }
}

// Export singleton instance
export const configManager = EnhancedConfigManager.getInstance();