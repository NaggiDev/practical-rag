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
exports.ConfigLoader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const configWatcher_1 = require("./configWatcher");
const defaults_1 = require("./defaults");
const env_1 = require("./env");
const file_1 = require("./file");
class ConfigLoader {
    constructor(options = {}) {
        this.configWatcher = null;
        this.loadedConfig = null;
        this.changeListeners = [];
        this.configDir = options.configDir || './config';
        this.environment = options.environment || process.env.NODE_ENV || 'development';
        this.configFileName = options.configFileName || 'config';
        this.watchForChanges = options.watchForChanges !== undefined ? options.watchForChanges : false;
        this.mergeWithEnv = options.mergeWithEnv !== undefined ? options.mergeWithEnv : true;
    }
    async loadConfig() {
        try {
            await this.ensureConfigDir();
            const configPaths = this.getConfigFilePaths();
            const config = await this.loadAndMergeConfigs(configPaths);
            if (this.watchForChanges) {
                this.setupConfigWatcher(configPaths);
            }
            this.loadedConfig = config;
            return config;
        }
        catch (error) {
            throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getConfig() {
        if (!this.loadedConfig) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        return this.loadedConfig;
    }
    async reloadConfig() {
        this.loadedConfig = null;
        return this.loadConfig();
    }
    async saveConfig(config, environment) {
        const targetEnv = environment || this.environment;
        const configPath = this.getEnvironmentConfigPath(targetEnv);
        await this.ensureConfigDir();
        await (0, file_1.saveToFile)(config, configPath);
        return configPath;
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
    getEnvironment() {
        return this.environment;
    }
    async switchEnvironment(environment) {
        this.environment = environment;
        return this.reloadConfig();
    }
    async getAvailableEnvironments() {
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
                .filter((env) => env !== null);
            return environments;
        }
        catch (error) {
            console.warn('Failed to get available environments:', error);
            return [];
        }
    }
    async createEnvironmentConfig(environment, config) {
        const configPath = this.getEnvironmentConfigPath(environment);
        await this.saveConfig(config, environment);
        return configPath;
    }
    getEnvironmentConfigPath(environment) {
        return path.join(this.configDir, `${this.configFileName}.${environment}.json`);
    }
    getBaseConfigPath() {
        return path.join(this.configDir, `${this.configFileName}.json`);
    }
    getConfigFilePaths() {
        const baseConfigPath = this.getBaseConfigPath();
        const envConfigPath = this.getEnvironmentConfigPath(this.environment);
        const paths = [baseConfigPath];
        if (envConfigPath !== baseConfigPath) {
            paths.push(envConfigPath);
        }
        return paths;
    }
    async ensureConfigDir() {
        if (!fs.existsSync(this.configDir)) {
            await fs.promises.mkdir(this.configDir, { recursive: true });
        }
    }
    async loadAndMergeConfigs(configPaths) {
        let config = {};
        config = { ...defaults_1.defaultConfig };
        if (configPaths[0] && fs.existsSync(configPaths[0])) {
            try {
                const baseConfig = await (0, file_1.loadFromFile)(configPaths[0]);
                config = this.deepMerge(config, baseConfig);
            }
            catch (error) {
                console.warn(`Failed to load base configuration from ${configPaths[0]}:`, error);
            }
        }
        if (configPaths.length > 1 && configPaths[1] && fs.existsSync(configPaths[1])) {
            try {
                const envConfig = await (0, file_1.loadFromFile)(configPaths[1]);
                config = this.deepMerge(config, envConfig);
            }
            catch (error) {
                console.warn(`Failed to load environment configuration from ${configPaths[1]}:`, error);
            }
        }
        if (this.mergeWithEnv) {
            const envConfig = (0, env_1.loadFromEnv)();
            config = this.deepMerge(config, envConfig);
        }
        return config;
    }
    setupConfigWatcher(configPaths) {
        if (this.configWatcher) {
            this.configWatcher.destroy();
        }
        this.configWatcher = new configWatcher_1.ConfigWatcher({
            configPaths,
            enabled: true
        });
        this.configWatcher.on('change', async (filePath) => {
            console.log(`Configuration file changed: ${filePath}`);
            try {
                const newConfig = await this.reloadConfig();
                this.notifyChangeListeners(newConfig);
            }
            catch (error) {
                console.error('Failed to reload configuration:', error);
            }
        });
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
    deepMerge(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            }
            else {
                result[key] = source[key];
            }
        }
        return result;
    }
    destroy() {
        if (this.configWatcher) {
            this.configWatcher.destroy();
            this.configWatcher = null;
        }
        this.changeListeners = [];
        this.loadedConfig = null;
    }
}
exports.ConfigLoader = ConfigLoader;
//# sourceMappingURL=configLoader.js.map