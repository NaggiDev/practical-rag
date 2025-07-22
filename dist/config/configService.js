"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.configService = exports.ConfigService = void 0;
const path = __importStar(require("path"));
const config_1 = require("../models/config");
const configLoader_1 = require("./configLoader");
const envValidator_1 = require("./envValidator");
const templates_1 = require("./templates");
const validation_1 = require("./validation");
class ConfigService {
    constructor(options = {}) {
        this.config = null;
        this.changeListeners = [];
        this.configLoader = new configLoader_1.ConfigLoader({
            configDir: options.configDir,
            environment: options.environment,
            configFileName: options.configFileName,
            watchForChanges: options.watchForChanges,
            validateOnLoad: options.validateOnLoad,
            mergeWithEnv: options.mergeWithEnv
        });
        this.validateConfig = options.validateConfig !== undefined ? options.validateConfig : true;
    }
    static getInstance(options) {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService(options);
        }
        return ConfigService.instance;
    }
    async initialize(options) {
        if (options) {
            this.configLoader.destroy();
            this.configLoader = new configLoader_1.ConfigLoader({
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
            const envValidation = envValidator_1.envValidator.validateEnvironment();
            if (!envValidation.valid) {
                console.warn('Environment validation warnings:', envValidation.warnings);
                if (envValidation.errors.length > 0) {
                    throw new Error(`Environment validation failed: ${envValidation.errors.join(', ')}`);
                }
            }
            const rawConfig = await this.configLoader.loadConfig();
            let validatedConfig = rawConfig;
            if (this.validateConfig) {
                validatedConfig = (0, validation_1.validateConfig)(rawConfig);
            }
            this.config = new config_1.SystemConfigModel(validatedConfig);
            this.configLoader.onConfigChange((newConfig) => {
                try {
                    if (this.validateConfig) {
                        newConfig = (0, validation_1.validateConfig)(newConfig);
                    }
                    this.config = new config_1.SystemConfigModel(newConfig);
                    this.notifyChangeListeners(this.config.toJSON());
                }
                catch (error) {
                    console.error('Error updating configuration:', error);
                }
            });
            return this.config.toJSON();
        }
        catch (error) {
            throw new Error(`Failed to initialize configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getConfig() {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }
        return this.config.toJSON();
    }
    updateConfig(updates) {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }
        const currentConfig = this.config.toJSON();
        const updatedConfig = { ...currentConfig, ...updates };
        let validatedConfig = updatedConfig;
        if (this.validateConfig) {
            validatedConfig = (0, validation_1.validateConfig)(updatedConfig);
        }
        this.config = new config_1.SystemConfigModel(validatedConfig);
        return this.config.toJSON();
    }
    async reloadConfig() {
        const rawConfig = await this.configLoader.reloadConfig();
        let validatedConfig = rawConfig;
        if (this.validateConfig) {
            validatedConfig = (0, validation_1.validateConfig)(rawConfig);
        }
        this.config = new config_1.SystemConfigModel(validatedConfig);
        return this.config.toJSON();
    }
    async saveConfig(environment) {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }
        return this.configLoader.saveConfig(this.config.toJSON(), environment);
    }
    getEnvironment() {
        return this.configLoader.getEnvironment();
    }
    async switchEnvironment(environment) {
        const rawConfig = await this.configLoader.switchEnvironment(environment);
        let validatedConfig = rawConfig;
        if (this.validateConfig) {
            validatedConfig = (0, validation_1.validateConfig)(rawConfig);
        }
        this.config = new config_1.SystemConfigModel(validatedConfig);
        return this.config.toJSON();
    }
    async getAvailableEnvironments() {
        return this.configLoader.getAvailableEnvironments();
    }
    async createEnvironmentConfig(environment, templateName) {
        let config;
        if (templateName) {
            config = templates_1.ConfigTemplateManager.generateConfig(templateName);
        }
        else if (this.config) {
            config = this.config.toJSON();
        }
        else {
            config = { ...templates_1.ConfigTemplateManager.generateConfig('development') };
        }
        return this.configLoader.createEnvironmentConfig(environment, config);
    }
    async exportConfig(filePath) {
        if (!this.config) {
            throw new Error('Configuration not initialized. Call initialize() first.');
        }
        const exportPath = filePath || path.join(this.configLoader.getEnvironment(), `config.${this.configLoader.getEnvironment()}.export.json`);
        await this.configLoader.saveConfig(this.config.toJSON(), exportPath);
        return exportPath;
    }
    async importConfig(filePath, environment) {
        const fs = require('fs');
        const configData = await fs.promises.readFile(filePath, 'utf8');
        const importedConfig = JSON.parse(configData);
        let validatedConfig = importedConfig;
        if (this.validateConfig) {
            validatedConfig = (0, validation_1.validateConfig)(importedConfig);
        }
        if (environment) {
            await this.configLoader.createEnvironmentConfig(environment, validatedConfig);
            return this.switchEnvironment(environment);
        }
        else {
            this.config = new config_1.SystemConfigModel(validatedConfig);
            return this.config.toJSON();
        }
    }
    onConfigChange(listener) {
        this.changeListeners.push(listener);
    }
    removeConfigChangeListener(listener) {
        const index = this.changeListeners.indexOf(listener);
        if (index > -1) {
            this.changeListeners.splice(index, 1);
        }
    }
    notifyChangeListeners(config) {
        for (const listener of this.changeListeners) {
            try {
                listener(config);
            }
            catch (error) {
                console.error('Error in config change listener:', error);
            }
        }
    }
    destroy() {
        this.configLoader.destroy();
        this.changeListeners = [];
        this.config = null;
        ConfigService.instance = null;
    }
}
exports.ConfigService = ConfigService;
exports.configService = ConfigService.getInstance();
//# sourceMappingURL=configService.js.map