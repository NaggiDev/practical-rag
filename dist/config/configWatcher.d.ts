import { EventEmitter } from 'events';
export interface ConfigWatcherOptions {
    configPaths: string[];
    debounceMs?: number;
    enabled?: boolean;
}
export declare class ConfigWatcher extends EventEmitter {
    private watchers;
    private debounceTimers;
    private lastModified;
    private options;
    private isWatching;
    constructor(options: ConfigWatcherOptions);
    start(): void;
    stop(): void;
    addWatchPath(configPath: string): void;
    removeWatchPath(configPath: string): void;
    getWatchPaths(): string[];
    checkModified(configPath: string): Promise<boolean>;
    private watchFile;
    private watchDirectory;
    private handleFileChange;
    private updateLastModified;
    destroy(): void;
}
//# sourceMappingURL=configWatcher.d.ts.map