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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const env_1 = require("./env");
const file_1 = require("./file");
const validation_1 = require("./validation");
class ConfigManager {
    constructor() {
        this.config = null;
    }
    static getInstance() {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
    async loadConfig(configPath) {
        try {
            const rawConfig = configPath
                ? await (0, file_1.loadFromFile)(configPath)
                : (0, env_1.loadFromEnv)();
            const validatedConfig = (0, validation_1.validateConfig)(rawConfig);
            this.config = validatedConfig;
            return this.config;
        }
        catch (error) {
            throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    getConfig() {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        return this.config;
    }
    updateConfig(updates) {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call loadConfig() first.');
        }
        this.config = { ...this.config, ...updates };
        (0, validation_1.validateConfig)(this.config);
    }
    reloadConfig(configPath) {
        this.config = null;
        return this.loadConfig(configPath);
    }
}
exports.ConfigManager = ConfigManager;
__exportStar(require("./configManager"), exports);
__exportStar(require("./defaults"), exports);
__exportStar(require("./env"), exports);
__exportStar(require("./envValidator"), exports);
__exportStar(require("./file"), exports);
__exportStar(require("./validation"), exports);
//# sourceMappingURL=index.js.map