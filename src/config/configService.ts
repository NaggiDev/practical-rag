import * as path from 'path';
import { SystemConfig, SystemConfigModel } from '../models/config';
import { ConfigLoader, ConfigLoaderOptions } from './configLoader';
import { envValidator } from './envValidator';
import { ConfigTemplateManager } from './templates';
import { validateConfig } from './validation';

export interface ConfigServiceOptions extends ConfigLoaderOptions {
    validateConfig?: boolean;
}

/**
 * ConfigService provides a unified interface for configuration management
 * with support for validation, hot-reloading, and environment-specific configurations.
 */
export class ConfigService {
    private static instance: ConfigService;
    private configLoader: ConfigLoader;
    private config: SystemConfigModel | null = null;
    private validateConfig: boolean;

    private constructor(options: ConfigServiceOptions = {}) {
        this.configLoader = new ConfigLoader({
            configDir: options.configDir,
            environment: options.environment,
            configFileName: options.configFileName,
            watchForChanges: options.watchForChanges,
            validateOnLoad: options.validateOnLoad,
            mergeWithEnv: options.mergeWithEnv
        });
        this.validateConfig = options.validateConfig !== undefined ? options.validateConfig : true;
    }

    /**
     * Get the singleton instance of ConfigService
     */
    public static getInstance(options?: ConfigServiceOptions): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService(options);
        }
        return ConfigService.instance;
    }

    /**
     * Initialize the configuration service
     */
    public async initialize(options?: ConfigServiceOptions): Promise<SystemConfig> {
        // Update options if provided
        if (options) {
            this.configLoader.destroy();
            this.configLoader = new ConfigLoader({
                configDir: options.configDir,
                environment: options.environment,
                configFileName: options.configFileName,
                watchForChanges: options.watchForChanges,
                validateOnLoad: options.validateOnLoad,
                mergeWithEnv: options.mergeWithEnv
            });
            this.validateConfig = options.validateConfig !== undefined ? options.validateConfig : this.validateConfig;
        }

        try {
            // Validate environment variables
            const envValidation = envValidator.validateEnvironment();
            if (!envValidation.valid) {
                console.warn('Environment validation warnings:', envValidation.warnings);
                if (envValidation.errors.length > 0) {
                    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
                }
            }

            // Load configuration
            const rawConfig = await this.configLoader.loadConfig();

            // Validate configuration if requested
            let validatedConfig = rawConfig;
            if (this.validateConfig) {
                validatedConfig = validateConfig(rawConfig);
            }

            // Create SystemConfigModel instance
            this.config = new SystemConfigModel(validatedConfig);

            // Set up change listener
            this.configLoader.onConfigChange((newConfig) => {
                try {
                    if (this.validateConfig) {
                        newConfig = validateConfig(newConfig);
                    }
                    this.config = new SystemConfigModel(newConfig);
                    this.notifyChangeListeners(this.config.toJSON());
                } catch (error) {
                    console.error('Error updating configuration:', error);
                }
            });

            return this.config.toJSON();
        } catch (error) {
            throw new Error(`Failed to initialize configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Get the current configuration
     */
    public getConfig(): SystemConfig {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }
        return this.config.toJSON();
    }

    /**
     * Update the configuration
     */
    public updateConfig(updates: Partial<SystemConfig>): SystemConfig {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }

        const currentConfig = this.config.toJSON();
        const updatedConfig = { ...currentConfig, ...updates };

        // Validate the updated configuration
        let validatedConfig = updatedConfig;
        if (this.validateConfig) {
            validatedConfig = validateConfig(updatedConfig);
        }

        this.config = new SystemConfigModel(validatedConfig);
        return this.config.toJSON();
    }

    /**
     * Reload the configuration
     */
    public async reloadConfig(): Promise<SystemConfig> {
        const rawConfig = await this.configLoader.reloadConfig();

        // Validate configuration if requested
        let validatedConfig = rawConfig;
        if (this.validateConfig) {
            validatedConfig = validateConfig(rawConfig);
        }

        this.config = new SystemConfigModel(validatedConfig);
        return this.config.toJSON();
    }

    /**
     * Save the current configuration
     */
    public async saveConfig(environment?: string): Promise<string> {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }

        return this.configLoader.saveConfig(this.config.toJSON(), environment);
    }

    /**
     * Get the current environment
     */
    public getEnvironment(): string {
        return this.configLoader.getEnvironment();
    }

    /**
     * Switch to a different environment
     */
    public async switchEnvironment(environment: string): Promise<SystemConfig> {
        const rawConfig = await this.configLoader.switchEnvironment(environment);

        // Validate configuration if requested
        let validatedConfig = rawConfig;
        if (this.validateConfig) {
            validatedConfig = validateConfig(rawConfig);
        }

        this.config = new SystemConfigModel(validatedConfig);
        return this.config.toJSON();
    }

    /**
     * Get a list of available environments
     */
    public async getAvailableEnvironments(): Promise<string[]> {
        return this.configLoader.getAvailableEnvironments();
    }

    /**
     * Create a new environment configuration
     */
    public async createEnvironmentConfig(environment: string, templateName?: string): Promise<string> {
        let config: SystemConfig;

        if (templateName) {
            // Use template if provided
            config = ConfigTemplateManager.generateConfig(templateName);
        } else if (this.config) {
            // Use current config as base if available
            config = this.config.toJSON();
        } else {
            // Fall back to default config
            config = { ...ConfigTemplateManager.generateConfig('development') };
        }

        return this.configLoader.createEnvironmentConfig(environment, config);
    }

    /**
     * Export the current configuration to a file
     */
    public async exportConfig(filePath?: string): Promise<string> {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }

        const exportPath = filePath || path.join(
            this.configLoader.getEnvironment(),
            `config.${this.configLoader.getEnvironment()}.export.json`
        );

        await this.configLoader.saveConfig(this.config.toJSON(), exportPath);
        return exportPath;
    }

    /**
     * Import configuration from a file
     */
    public async importConfig(filePath: string, environment?: string): Promise<SystemConfig> {
        const fs = require('fs');
        const configData = await fs.promises.readFile(filePath, 'utf8');
        const importedConfig = JSON.parse(configData);

        // Validate the imported configuration
        let validatedConfig = importedConfig;
        if (this.validateConfig) {
            validatedConfig = validateConfig(importedConfig);
        }

        if (environment) {
            // Save to environment-specific file
            await this.configLoader.createEnvironmentConfig(environment, validatedConfig);
            return this.switchEnvironment(environment);
        } else {
            // Just update the current config
            this.config = new SystemConfigModel(validatedConfig);
            return this.config.toJSON();
        }
    }

    // Event handling for configuration changes
    private changeListeners: Array<(config: SystemConfig) => void> = [];

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
     * Clean up resources
     */
    public destroy(): void {
        this.configLoader.destroy();
        this.changeListeners = [];
        this.config = null;
        ConfigService.instance = null as any;
    }
}

// Export singleton instance
export const configService = ConfigService.getInstance();