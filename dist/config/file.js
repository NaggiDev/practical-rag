"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFromFile = loadFromFile;
exports.saveToFile = saveToFile;
const fs_1 = require("fs");
const defaults_1 = require("./defaults");
async function loadFromFile(configPath) {
    try {
        const configData = await fs_1.promises.readFile(configPath, 'utf-8');
        const parsedConfig = JSON.parse(configData);
        return mergeWithDefaults(parsedConfig, defaults_1.defaultConfig);
    }
    catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function saveToFile(config, configPath) {
    try {
        const configData = JSON.stringify(config, null, 2);
        await fs_1.promises.writeFile(configPath, configData, 'utf-8');
    }
    catch (error) {
        throw new Error(`Failed to save configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
function mergeWithDefaults(config, defaults) {
    const merged = { ...defaults };
    for (const key in config) {
        if (config[key] && typeof config[key] === 'object' && !Array.isArray(config[key])) {
            merged[key] = {
                ...merged[key],
                ...config[key]
            };
        }
        else {
            merged[key] = config[key];
        }
    }
    return merged;
}
//# sourceMappingURL=file.js.map