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
exports.configManager = exports.EnhancedConfigManager = void 0;
const fs = __importStar(require("fs"));
const config_1 = require("../models/config");
const dataSource_1 = require("../models/dataSource");
const defaults_1 = require("./defaults");
const env_1 = require("./env");
const file_1 = require("./file");
const validation_1 = require("./validation");
class EnhancedConfigManager {
    constructor() {
        this.config = null;
        this.watchForChanges = false;
        this.changeListeners = [];
    }
    static getInstance() {
        if (!EnhancedConfigManager.instance) {
            EnhancedConfigManager.instance = new EnhancedConfigManager();
        }
        return EnhancedConfigManager.instance;
    }
    async loadConfig(options = {}) {
        try {
            this.configPath = options.configPath;
            this.watchForChanges = options.watchForChanges || false;
            const rawConfig = this.configPath
                ? await (0, file_1.loadFromFile)(this.configPath)
                : (0, env_1.loadFromEnv)();
            const mergedConfig = this.mergeWithDefaults(rawConfig);
            const validatedConfig = options.validateOnLoad !== false
                ? (0, validation_1.validateConfig)(mergedConfig)
                : mergedConfig;
            this.config = new config_1.SystemConfigModel(validatedConfig);
            if (this.watchForChanges && this.configPath) {
                this.setupFileWatcher();
            }
            return this.config.toJSON();
        }
        catch (error) {
            throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getConfig() {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        return this.config.toJSON();
    }
    updateConfig(updates) {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        const currentConfig = this.config.toJSON();
        const updatedConfig = { ...currentConfig, ...updates };
        const validatedConfig = (0, validation_1.validateConfig)(updatedConfig);
        this.config = new config_1.SystemConfigModel(validatedConfig);
        this.notifyChangeListeners(this.config.toJSON());
    }
    async reloadConfig(options) {
        this.cleanup();
        this.config = null;
        return this.loadConfig(options || { configPath: this.configPath, watchForChanges: this.watchForChanges });
    }
    addDataSource(dataSourceConfig, type) {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        const validatedConfig = new dataSource_1.DataSourceConfigModel(dataSourceConfig, type);
        const currentConfig = this.config.toJSON();
        const updatedDataSources = [...currentConfig.dataSources, validatedConfig.config];
        this.updateConfig({ dataSources: updatedDataSources });
    }
    removeDataSource(index) {
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
    validateDataSourceConfig(config, type) {
        try {
            new dataSource_1.DataSourceConfigModel(config, type);
            return true;
        }
        catch {
            return false;
        }
    }
    getEnvironmentVariables() {
        const envVars = {};
        envVars.PORT = process.env.PORT || '3000';
        envVars.HOST = process.env.HOST || '0.0.0.0';
        envVars.CORS_ENABLED = process.env.CORS_ENABLED || 'true';
        envVars.CORS_ORIGINS = process.env.CORS_ORIGINS || '*';
        envVars.VECTOR_DB_PROVIDER = process.env.VECTOR_DB_PROVIDER || 'faiss';
        envVars.VECTOR_DB_CONNECTION_STRING = process.env.VECTOR_DB_CONNECTION_STRING || '';
        envVars.VECTOR_DB_API_KEY = process.env.VECTOR_DB_API_KEY || '';
        envVars.VECTOR_DB_INDEX_NAME = process.env.VECTOR_DB_INDEX_NAME || 'default-index';
        envVars.VECTOR_DB_DIMENSION = process.env.VECTOR_DB_DIMENSION || '384';
        envVars.REDIS_HOST = process.env.REDIS_HOST || 'localhost';
        envVars.REDIS_PORT = process.env.REDIS_PORT || '6379';
        envVars.REDIS_PASSWORD = process.env.REDIS_PASSWORD || '';
        envVars.REDIS_DB = process.env.REDIS_DB || '0';
        envVars.EMBEDDING_PROVIDER = process.env.EMBEDDING_PROVIDER || 'sentence-transformers';
        envVars.EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'all-MiniLM-L6-v2';
        envVars.EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || '';
        envVars.EMBEDDING_DIMENSION = process.env.EMBEDDING_DIMENSION || '384';
        return envVars;
    }
    validateEnvironmentVariables() {
        const errors = [];
        const envVars = this.getEnvironmentVariables();
        const requiredVars = ['PORT', 'HOST'];
        for (const varName of requiredVars) {
            if (!envVars[varName]) {
                errors.push(`Missing required environment variable: ${varName}`);
            }
        }
        const numericVars = ['PORT', 'REDIS_PORT', 'VECTOR_DB_DIMENSION', 'EMBEDDING_DIMENSION'];
        for (const varName of numericVars) {
            if (envVars[varName] && isNaN(Number(envVars[varName]))) {
                errors.push(`Environment variable ${varName} must be a number`);
            }
        }
        const booleanVars = ['CORS_ENABLED'];
        for (const varName of booleanVars) {
            if (envVars[varName] && !['true', 'false'].includes(envVars[varName].toLowerCase())) {
                errors.push(`Environment variable ${varName} must be 'true' or 'false'`);
            }
        }
        return { valid: errors.length === 0, errors };
    }
    async saveConfig(filePath) {
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
        }
        catch (error) {
            throw new Error(`Failed to save configuration to ${targetPath}: ${error}`);
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
    mergeWithDefaults(config) {
        return {
            server: { ...defaults_1.defaultConfig.server, ...config.server },
            database: {
                vector: { ...defaults_1.defaultConfig.database.vector, ...config.database?.vector },
                metadata: { ...defaults_1.defaultConfig.database.metadata, ...config.database?.metadata }
            },
            cache: {
                redis: { ...defaults_1.defaultConfig.cache.redis, ...config.cache?.redis },
                ttl: { ...defaults_1.defaultConfig.cache.ttl, ...config.cache?.ttl },
                maxMemory: config.cache?.maxMemory || defaults_1.defaultConfig.cache.maxMemory,
                evictionPolicy: config.cache?.evictionPolicy || defaults_1.defaultConfig.cache.evictionPolicy
            },
            embedding: { ...defaults_1.defaultConfig.embedding, ...config.embedding },
            search: {
                ...defaults_1.defaultConfig.search,
                ...config.search,
                hybridSearch: { ...defaults_1.defaultConfig.search.hybridSearch, ...config.search?.hybridSearch },
                reranking: { ...defaults_1.defaultConfig.search.reranking, ...config.search?.reranking }
            },
            monitoring: {
                metrics: { ...defaults_1.defaultConfig.monitoring.metrics, ...config.monitoring?.metrics },
                logging: { ...defaults_1.defaultConfig.monitoring.logging, ...config.monitoring?.logging },
                healthCheck: { ...defaults_1.defaultConfig.monitoring.healthCheck, ...config.monitoring?.healthCheck }
            },
            dataSources: config.dataSources || defaults_1.defaultConfig.dataSources
        };
    }
    setupFileWatcher() {
        if (!this.configPath)
            return;
        try {
            this.fileWatcher = fs.watch(this.configPath, async (eventType) => {
                if (eventType === 'change') {
                    try {
                        await this.reloadConfig();
                    }
                    catch (error) {
                        console.error('Failed to reload configuration:', error);
                    }
                }
            });
        }
        catch (error) {
            console.warn('Failed to set up file watcher:', error);
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
    cleanup() {
        if (this.fileWatcher) {
            this.fileWatcher.close();
            this.fileWatcher = undefined;
        }
    }
    destroy() {
        this.cleanup();
        this.changeListeners = [];
        this.config = null;
        EnhancedConfigManager.instance = null;
    }
}
exports.EnhancedConfigManager = EnhancedConfigManager;
exports.configManager = EnhancedConfigManager.getInstance();
//# sourceMappingURL=configManager.js.map