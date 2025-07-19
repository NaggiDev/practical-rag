import { promises as fs } from 'fs';
import { SystemConfig } from '../models/config';
import { defaultConfig } from './defaults';

export async function loadFromFile(configPath: string): Promise<SystemConfig> {
    try {
        const configData = await fs.readFile(configPath, 'utf-8');
        const parsedConfig = JSON.parse(configData);

        // Merge with defaults to ensure all required fields are present
        return mergeWithDefaults(parsedConfig, defaultConfig);
    } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
            throw new Error(`Configuration file not found: ${configPath}`);
        }
        throw new Error(`Failed to load configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export async function saveToFile(config: SystemConfig, configPath: string): Promise<void> {
    try {
        const configData = JSON.stringify(config, null, 2);
        await fs.writeFile(configPath, configData, 'utf-8');
    } catch (error) {
        throw new Error(`Failed to save configuration file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

function mergeWithDefaults(config: any, defaults: SystemConfig): SystemConfig {
    const merged = { ...defaults };

    // Deep merge configuration objects
    for (const key in config) {
        if (config[key] && typeof config[key] === 'object' && !Array.isArray(config[key])) {
            merged[key as keyof SystemConfig] = {
                ...(merged[key as keyof SystemConfig] as any),
                ...config[key]
            };
        } else {
            (merged as any)[key] = config[key];
        }
    }

    return merged;
}