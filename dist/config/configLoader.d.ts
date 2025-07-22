import { SystemConfig } from '../models/config';
export interface ConfigLoaderOptions {
    configDir?: string;
    environment?: string;
    configFileName?: string;
    watchForChanges?: boolean;
    validateOnLoad?: boolean;
    mergeWithEnv?: boolean;
}
export declare class ConfigLoader {
    private configDir;
    private environment;
    private configFileName;
    private watchForChanges;
    private mergeWithEnv;
    private configWatcher;
    private loadedConfig;
    private changeListeners;
    constructor(options?: ConfigLoaderOptions);
    loadConfig(): Promise<SystemConfig>;
    getConfig(): SystemConfig;
    reloadConfig(): Promise<SystemConfig>;
    saveConfig(config: SystemConfig, environment?: string): Promise<string>;
    onConfigChange(listener: (config: SystemConfig) => void): void;
    removeConfigChangeListener(listener: (config: SystemConfig) => void): void;
    getEnvironment(): string;
    switchEnvironment(environment: string): Promise<SystemConfig>;
    getAvailableEnvironments(): Promise<string[]>;
    createEnvironmentConfig(environment: string, config: SystemConfig): Promise<string>;
    private getEnvironmentConfigPath;
    private getBaseConfigPath;
    private getConfigFilePaths;
    private ensureConfigDir;
    private loadAndMergeConfigs;
    private setupConfigWatcher;
    private notifyChangeListeners;
    private deepMerge;
    destroy(): void;
}
//# sourceMappingURL=configLoader.d.ts.map