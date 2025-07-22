import { SystemConfig } from '../models/config';
import { ConfigLoaderOptions } from './configLoader';
export interface ConfigServiceOptions extends ConfigLoaderOptions {
    validateConfig?: boolean;
}
export declare class ConfigService {
    private static instance;
    private configLoader;
    private config;
    private validateConfig;
    private constructor();
    static getInstance(options?: ConfigServiceOptions): ConfigService;
    initialize(options?: ConfigServiceOptions): Promise<SystemConfig>;
    getConfig(): SystemConfig;
    updateConfig(updates: Partial<SystemConfig>): SystemConfig;
    reloadConfig(): Promise<SystemConfig>;
    saveConfig(environment?: string): Promise<string>;
    getEnvironment(): string;
    switchEnvironment(environment: string): Promise<SystemConfig>;
    getAvailableEnvironments(): Promise<string[]>;
    createEnvironmentConfig(environment: string, templateName?: string): Promise<string>;
    exportConfig(filePath?: string): Promise<string>;
    importConfig(filePath: string, environment?: string): Promise<SystemConfig>;
    private changeListeners;
    onConfigChange(listener: (config: SystemConfig) => void): void;
    removeConfigChangeListener(listener: (config: SystemConfig) => void): void;
    private notifyChangeListeners;
    destroy(): void;
}
export declare const configService: ConfigService;
//# sourceMappingURL=configService.d.ts.map