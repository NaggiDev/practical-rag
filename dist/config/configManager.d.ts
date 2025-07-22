import { SystemConfig } from '../models/config';
export interface ConfigManagerOptions {
    configPath?: string;
    envPrefix?: string;
    watchForChanges?: boolean;
    validateOnLoad?: boolean;
    environment?: 'development' | 'production' | 'test';
    configDir?: string;
}
export declare class EnhancedConfigManager {
    private static instance;
    private config;
    private configPath?;
    private watchForChanges;
    private fileWatcher?;
    private changeListeners;
    private environment;
    private configDir;
    private lastModified;
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
    private getEnvironmentConfigPath;
    private loadEnvironmentConfig;
    private deepMerge;
    private checkFileModified;
    private setupFileWatcher;
    private notifyChangeListeners;
    private cleanup;
    createEnvironmentConfig(environment: string, config: Partial<SystemConfig>): Promise<void>;
    getAvailableEnvironments(): Promise<string[]>;
    getCurrentEnvironment(): string;
    switchEnvironment(environment: string): Promise<SystemConfig>;
    exportConfig(filePath?: string): Promise<string>;
    importConfig(filePath: string, environment?: string): Promise<SystemConfig>;
    getConfigSummary(): {
        environment: string;
        configPath?: string;
        watchForChanges: boolean;
        lastModified: Date | null;
        dataSources: number;
        validationStatus: 'valid' | 'invalid' | 'unknown';
    };
    destroy(): void;
}
export declare const configManager: EnhancedConfigManager;
//# sourceMappingURL=configManager.d.ts.map