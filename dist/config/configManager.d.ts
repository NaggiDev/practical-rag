import { SystemConfig } from '../models/config';
export interface ConfigManagerOptions {
    configPath?: string;
    envPrefix?: string;
    watchForChanges?: boolean;
    validateOnLoad?: boolean;
}
export declare class EnhancedConfigManager {
    private static instance;
    private config;
    private configPath?;
    private watchForChanges;
    private fileWatcher?;
    private changeListeners;
    private constructor();
    static getInstance(): EnhancedConfigManager;
    loadConfig(options?: ConfigManagerOptions): Promise<SystemConfig>;
    getConfig(): SystemConfig;
    updateConfig(updates: Partial<SystemConfig>): void;
    reloadConfig(options?: ConfigManagerOptions): Promise<SystemConfig>;
    addDataSource(dataSourceConfig: any, type: 'file' | 'database' | 'api'): void;
    removeDataSource(index: number): void;
    validateDataSourceConfig(config: any, type: 'file' | 'database' | 'api'): boolean;
    getEnvironmentVariables(): Record<string, string>;
    validateEnvironmentVariables(): {
        valid: boolean;
        errors: string[];
    };
    saveConfig(filePath?: string): Promise<void>;
    onConfigChange(listener: (config: SystemConfig) => void): void;
    removeConfigChangeListener(listener: (config: SystemConfig) => void): void;
    private mergeWithDefaults;
    private setupFileWatcher;
    private notifyChangeListeners;
    private cleanup;
    destroy(): void;
}
export declare const configManager: EnhancedConfigManager;
//# sourceMappingURL=configManager.d.ts.map