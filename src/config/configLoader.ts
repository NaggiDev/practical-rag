import * as fs from 'fs';
import * as path from 'path';
import { SystemConfig } from '../models/config';
import { ConfigWatcher } from './configWatcher';
import { defaultConfig } from './defaults';
import { loadFromEnv } from './env';
import { loadFromFile, saveToFile } from './file';

export interface ConfigLoaderOptions {
    configDir?: string;
    environment?: string;
    configFileName?: string;
    watchForChanges?: boolean;
    validateOnLoad?: boolean;
    mergeWithEnv?: boolean;
}

/**
 * ConfigLoader handles loading configuration from files and environment variables
 * with support for environment-specific configurations and hot-reloading.
 */
export class ConfigLoader {
    private configDir: string;
    private environment: string;
    private configFileName: string;
    private watchForChanges: boolean;
    private validateOnLoad: boolean;
    private mergeWithEnv: boolean;
    private configWatcher: ConfigWatcher | null = null;
    private loadedConfig: SystemConfig | null = null;
    private changeListeners: Array<(config: SystemConfig) => void> = [];

    constructor(options: ConfigLoaderOptions = {}) {
        this.configDir = options.configDir || './config';
        this.environment = options.environment || process.env.NODE_ENV || 'development';
        this.configFileName = options.configFileName || 'config';
        this.watchForChanges = options.watchForChanges !== undefined ? options.watchForChanges : false;
        this.validateOnLoad = options.validateOnLoad !== undefined ? options.validateOnLoad : true;
        this.mergeWithEnv = options.mergeWithEnv !== undefined ? options.mergeWithEnv : true;
    }

    /**
     * Load configuration from files and environment variables
     */
    public async loadConfig(): Promise<SystemConfig> {
        try {
            // Ensure config directory exists
            await this.ensureConfigDir();

            // Get all relevant config file paths
            const configPaths = this.getConfigFilePaths();

            // Load and merge configurations
            const config = await this.loadAndMergeConfigs(configPaths);

            // Set up file watcher if requested
            if (this.watchForChanges) {
                this.setupConfigWatcher(configPaths);
            }

            this.loadedConfig = config;
            return config;
        } catch (error) {
            throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get the current loaded configuration
     */
    public getConfig(): SystemConfig {
        if (!this.loadedConfig) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        return this.loadedConfig;
    }

    /**
     * Reload configuration from files and environment variables
     */
    public async reloadConfig(): Promise<SystemConfig> {
        this.loadedConfig = null;
        return this.loadConfig();
    }

    /**
     * Save configuration to a file
     */
    public async saveConfig(config: SystemConfig, environment?: string): Promise<string> {
        const targetEnv = environment || this.environment;
        const configPath = this.getEnvironmentConfigPath(targetEnv);

        // Ensure directory exists
        await this.ensureConfigDir();

        // Save configuration to file
        await saveToFile(config, configPath);

        return configPath;
    }

    /**
     * Register a listener for configuration changes
     */
    public onConfigChange(listener: (config: SystemConfig) => void): void {
        this.changeListeners.push(listener);
    }

    /**
     * Remove a configuration change listener
     */
    public removeConfigChangeListener(listener: (config: SystemConfig) => void): void {
        const index = this.changeListeners.indexOf(listener);
        if (index > -1) {
            this.changeListeners.splice(index, 1);
        }
    }

    /**
     * Get the current environment
     */
    public getEnvironment(): string {
        return this.environment;
    }

    /**
     * Switch to a different environment and reload configuration
     */
    public async switchEnvironment(environment: string): Promise<SystemConfig> {
        this.environment = environment;
        return this.reloadConfig();
    }

    /**
     * Get a list of available environments based on config files
     */
    public async getAvailableEnvironments(): Promise<string[]> {
        try {
            if (!fs.existsSync(this.configDir)) {
                return [];
            }

            const files = await fs.promises.readdir(this.configDir);
            const envRegex = new RegExp(`^${this.configFileName}\\.(.*)\\.json$`);

            const environments = files
                .map(file => {
                    const match = file.match(envRegex);
                    return match ? match[1] : null;
                })
                .filter((env): env is string => env !== null);

            return environments;
        } catch (error) {
            console.warn('Failed to get available environments:', error);
            return [];
        }
    }

    /**
     * Create a new environment configuration file
     */
    public async createEnvironmentConfig(environment: string, config: SystemConfig): Promise<string> {
        const configPath = this.getEnvironmentConfigPath(environment);
        await this.saveConfig(config, environment);
        return configPath;
    }

    /**
     * Get the path to the environment-specific config file
     */
    private getEnvironmentConfigPath(environment: string): string {
        return path.join(this.configDir, `${this.configFileName}.${environment}.json`);
    }

    /**
     * Get the path to the base config file
     */
    private getBaseConfigPath(): string {
        return path.join(this.configDir, `${this.configFileName}.json`);
    }

    /**
     * Get all relevant config file paths
     */
    private getConfigFilePaths(): string[] {
        const baseConfigPath = this.getBaseConfigPath();
        const envConfigPath = this.getEnvironmentConfigPath(this.environment);

        const paths = [baseConfigPath];

        // Only add environment config if it's different from base config
        if (envConfigPath !== baseConfigPath) {
            paths.push(envConfigPath);
        }

        return paths;
    }

    /**
     * Ensure the config directory exists
     */
    private async ensureConfigDir(): Promise<void> {
        if (!fs.existsSync(this.configDir)) {
            await fs.promises.mkdir(this.configDir, { recursive: true });
        }
    }

    /**
     * Load and merge configurations from multiple sources
     */
    private async loadAndMergeConfigs(configPaths: string[]): Promise<SystemConfig> {
        let config: Partial<SystemConfig> = {};

        // Start with default config
        config = { ...defaultConfig };

        // Load base config if it exists
        if (fs.existsSync(configPaths[0])) {
            try {
                const baseConfig = await loadFromFile(configPaths[0]);
                config = this.deepMerge(config, baseConfig);
            } catch (error) {
                console.warn(`Failed to load base configuration from ${configPaths[0]}:`, error);
            }
        }

        // Load environment-specific config if it exists
        if (configPaths.length > 1 && fs.existsSync(configPaths[1])) {
            try {
                const envConfig = await loadFromFile(configPaths[1]);
                config = this.deepMerge(config, envConfig);
            } catch (error) {
                console.warn(`Failed to load environment configuration from ${configPaths[1]}:`, error);
            }
        }

        // Merge with environment variables if requested
        if (this.mergeWithEnv) {
            const envConfig = loadFromEnv();
            config = this.deepMerge(config, envConfig);
        }

        return config as SystemConfig;
    }

    /**
     * Set up the config watcher for hot-reloading
     */
    private setupConfigWatcher(configPaths: string[]): void {
        // Clean up existing watcher if there is one
        if (this.configWatcher) {
            this.configWatcher.destroy();
        }

        // Create new watcher
        this.configWatcher = new ConfigWatcher({
            configPaths,
            enabled: true
        });

        // Listen for changes
        this.configWatcher.on('change', async (filePath) => {
            console.log(`Configuration file changed: ${filePath}`);
            try {
                const newConfig = await this.reloadConfig();
                this.notifyChangeListeners(newConfig);
            } catch (error) {
                console.error('Failed to reload configuration:', error);
            }
        });
    }

    /**
     * Notify all listeners of configuration changes
     */
    private notifyChangeListeners(config: SystemConfig): void {
        for (const listener of this.changeListeners) {
            try {
                listener(config);
            } catch (error) {
                console.error('Error in config change listener:', error);
            }
        }
    }

    /**
     * Deep merge two objects
     */
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

    /**
     * Clean up resources
     */
    public destroy(): void {
        if (this.configWatcher) {
            this.configWatcher.destroy();
            this.configWatcher = null;
        }
        this.changeListeners = [];
        this.loadedConfig = null;
    }
}