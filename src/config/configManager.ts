import * as fs from 'fs';
import * as path from 'path';
import { SystemConfig, SystemConfigModel } from '../models/config';
import { DataSourceConfigModel } from '../models/dataSource';
import { defaultConfig } from './defaults';
import { loadFromEnv } from './env';
import { envValidator } from './envValidator';
import { loadFromFile } from './file';
import { validateConfig } from './validation';

export interface ConfigManagerOptions {
    configPath?: string;
    envPrefix?: string;
    watchForChanges?: boolean;
    validateOnLoad?: boolean;
    environment?: 'development' | 'production' | 'test';
    configDir?: string;
}

export class EnhancedConfigManager {
    private static instance: EnhancedConfigManager;
    private config: SystemConfigModel | null = null;
    private configPath?: string;
    private watchForChanges: boolean = false;
    private fileWatcher?: fs.FSWatcher;
    private changeListeners: Array<(config: SystemConfig) => void> = [];
    private environment: string = 'development';
    private configDir: string = './config';
    private lastModified: number = 0;

    private constructor() { }

    public static getInstance(): EnhancedConfigManager {
        if (!EnhancedConfigManager.instance) {
            EnhancedConfigManager.instance = new EnhancedConfigManager();
        }
        return EnhancedConfigManager.instance;
    }

    public async loadConfig(options: ConfigManagerOptions = {}): Promise<SystemConfig> {
        try {
            this.environment = options.environment || process.env.NODE_ENV || 'development';
            this.configDir = options.configDir || './config';
            this.watchForChanges = options.watchForChanges || false;

            // Determine configuration path based on environment
            this.configPath = options.configPath || this.getEnvironmentConfigPath();

            // Load configuration with environment-specific support
            const rawConfig = await this.loadEnvironmentConfig();

            // Validate environment variables
            const envValidation = envValidator.validateEnvironment();
            if (!envValidation.valid) {
                console.warn('Environment validation warnings:', envValidation.warnings);
                if (envValidation.errors.length > 0) {
                    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
                }
            }

            // Merge with defaults
            const mergedConfig = this.mergeWithDefaults(rawConfig);

            // Validate configuration if requested
            const validatedConfig = options.validateOnLoad !== false
                ? validateConfig(mergedConfig)
                : mergedConfig;

            // Create SystemConfigModel instance
            this.config = new SystemConfigModel(validatedConfig);

            // Set up file watching if requested
            if (this.watchForChanges) {
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

    private getEnvironmentConfigPath(): string {
        const baseConfigPath = path.join(this.configDir, 'config.json');
        const envConfigPath = path.join(this.configDir, `config.${this.environment}.json`);

        // Check if environment-specific config exists
        if (fs.existsSync(envConfigPath)) {
            return envConfigPath;
        }

        return baseConfigPath;
    }

    private async loadEnvironmentConfig(): Promise<SystemConfig> {
        let config: Partial<SystemConfig> = {};

        // Load base configuration if it exists
        const baseConfigPath = path.join(this.configDir, 'config.json');
        if (fs.existsSync(baseConfigPath)) {
            try {
                config = await loadFromFile(baseConfigPath);
            } catch (error) {
                console.warn(`Failed to load base configuration from ${baseConfigPath}:`, error);
            }
        }

        // Load environment-specific configuration if it exists
        const envConfigPath = path.join(this.configDir, `config.${this.environment}.json`);
        if (fs.existsSync(envConfigPath)) {
            try {
                const envConfig = await loadFromFile(envConfigPath);
                config = this.deepMerge(config, envConfig);
            } catch (error) {
                console.warn(`Failed to load environment configuration from ${envConfigPath}:`, error);
            }
        }

        // If specific config path is provided, use it
        if (this.configPath && this.configPath !== this.getEnvironmentConfigPath()) {
            try {
                const specificConfig = await loadFromFile(this.configPath);
                config = this.deepMerge(config, specificConfig);
            } catch (error) {
                console.warn(`Failed to load specific configuration from ${this.configPath}:`, error);
            }
        }

        // Always merge with environment variables (highest priority)
        const envConfig = loadFromEnv();
        config = this.deepMerge(config, envConfig);

        return config as SystemConfig;
    }

    private deepMerge(target: any, source: any): any {
        const result = { ...target };

        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }

        return result;
    }

    private async checkFileModified(): Promise<boolean> {
        if (!this.configPath || !fs.existsSync(this.configPath)) {
            return false;
        }

        try {
            const stats = await fs.promises.stat(this.configPath);
            const currentModified = stats.mtime.getTime();

            if (currentModified > this.lastModified) {
                this.lastModified = currentModified;
                return true;
            }

            return false;
        } catch (error) {
            console.warn('Failed to check file modification time:', error);
            return false;
        }
    }

    private setupFileWatcher(): void {
        const watchPaths = [
            this.configPath,
            path.join(this.configDir, 'config.json'),
            path.join(this.configDir, `config.${this.environment}.json`)
        ].filter((p): p is string => p !== undefined && fs.existsSync(p));

        if (watchPaths.length === 0) return;

        try {
            // Watch all relevant config files
            for (const watchPath of watchPaths) {
                const watcher = fs.watch(watchPath, async (eventType) => {
                    if (eventType === 'change') {
                        // Debounce rapid file changes
                        setTimeout(async () => {
                            try {
                                const hasChanged = await this.checkFileModified();
                                if (hasChanged) {
                                    console.log(`Configuration file changed: ${watchPath}`);
                                    await this.reloadConfig();
                                }
                            } catch (error) {
                                console.error('Failed to reload configuration:', error);
                            }
                        }, 100);
                    }
                });

                // Store watcher for cleanup
                if (!this.fileWatcher) {
                    this.fileWatcher = watcher;
                }
            }
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

    public async createEnvironmentConfig(environment: string, config: Partial<SystemConfig>): Promise<void> {
        const envConfigPath = path.join(this.configDir, `config.${environment}.json`);

        // Ensure config directory exists
        await fs.promises.mkdir(this.configDir, { recursive: true });

        try {
            const configData = JSON.stringify(config, null, 2);
            await fs.promises.writeFile(envConfigPath, configData, 'utf8');
        } catch (error) {
            throw new Error(`Failed to create environment configuration for ${environment}: ${error}`);
        }
    }

    public async getAvailableEnvironments(): Promise<string[]> {
        try {
            if (!fs.existsSync(this.configDir)) {
                return [];
            }

            const files = await fs.promises.readdir(this.configDir);
            const environments = files
                .filter(file => file.startsWith('config.') && file.endsWith('.json'))
                .map(file => file.replace('config.', '').replace('.json', ''))
                .filter(env => env !== 'json'); // Filter out base config.json

            return environments;
        } catch (error) {
            console.warn('Failed to get available environments:', error);
            return [];
        }
    }

    public getCurrentEnvironment(): string {
        return this.environment;
    }

    public async switchEnvironment(environment: string): Promise<SystemConfig> {
        this.environment = environment;
        return this.reloadConfig({
            environment: environment as 'development' | 'production' | 'test',
            watchForChanges: this.watchForChanges
        });
    }

    public async exportConfig(filePath?: string): Promise<string> {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }

        const exportPath = filePath || path.join(this.configDir, `config.${this.environment}.export.json`);
        const configData = JSON.stringify(this.config.toJSON(), null, 2);

        await fs.promises.writeFile(exportPath, configData, 'utf8');
        return exportPath;
    }

    public async importConfig(filePath: string, environment?: string): Promise<SystemConfig> {
        try {
            const importedConfig = await loadFromFile(filePath);

            if (environment) {
                await this.createEnvironmentConfig(environment, importedConfig);
                return this.switchEnvironment(environment);
            } else {
                this.config = new SystemConfigModel(importedConfig);
                this.notifyChangeListeners(this.config.toJSON());
                return this.config.toJSON();
            }
        } catch (error) {
            throw new Error(`Failed to import configuration from ${filePath}: ${error}`);
        }
    }

    public getConfigSummary(): {
        environment: string;
        configPath?: string;
        watchForChanges: boolean;
        lastModified: Date | null;
        dataSources: number;
        validationStatus: 'valid' | 'invalid' | 'unknown';
    } {
        return {
            environment: this.environment,
            configPath: this.configPath,
            watchForChanges: this.watchForChanges,
            lastModified: this.lastModified ? new Date(this.lastModified) : null,
            dataSources: this.config?.dataSources.length || 0,
            validationStatus: this.config ? 'valid' : 'unknown'
        };
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