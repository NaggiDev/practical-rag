import { SystemConfig } from '../models/config';
export declare class ConfigManager {
    private static instance;
    private config;
    private constructor();
    static getInstance(): ConfigManager;
    loadConfig(configPath?: string): Promise<SystemConfig>;
    getConfig(): SystemConfig;
    updateConfig(updates: Partial<SystemConfig>): void;
    reloadConfig(configPath?: string): Promise<SystemConfig>;
}
export * from './configManager';
export * from './defaults';
export * from './env';
export * from './envValidator';
export * from './file';
export * from './validation';
//# sourceMappingURL=index.d.ts.map