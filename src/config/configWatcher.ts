import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

export interface ConfigWatcherOptions {
    configPaths: string[];
    debounceMs?: number;
    enabled?: boolean;
}

/**
 * ConfigWatcher monitors configuration files for changes and emits events when they change.
 * It supports watching multiple files and debouncing to prevent multiple events for rapid changes.
 */
export class ConfigWatcher extends EventEmitter {
    private watchers: Map<string, fs.FSWatcher> = new Map();
    private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
    private lastModified: Map<string, number> = new Map();
    private options: Required<ConfigWatcherOptions>;
    private isWatching: boolean = false;

    constructor(options: ConfigWatcherOptions) {
        super();
        this.options = {
            configPaths: options.configPaths,
            debounceMs: options.debounceMs || 300,
            enabled: options.enabled !== undefined ? options.enabled : true
        };

        if (this.options.enabled) {
            this.start();
        }
    }

    /**
     * Start watching configuration files for changes
     */
    public start(): void {
        if (this.isWatching) return;

        this.isWatching = true;

        for (const configPath of this.options.configPaths) {
            if (fs.existsSync(configPath)) {
                this.watchFile(configPath);
                this.updateLastModified(configPath);
            } else {
                // Watch the directory to detect when the file is created
                const dirPath = path.dirname(configPath);
                if (fs.existsSync(dirPath)) {
                    this.watchDirectory(dirPath, configPath);
                }
            }
        }
    }

    /**
     * Stop watching configuration files
     */
    public stop(): void {
        if (!this.isWatching) return;

        this.isWatching = false;

        // Close all file watchers
        for (const watcher of this.watchers.values()) {
            watcher.close();
        }
        this.watchers.clear();

        // Clear all debounce timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }

    /**
     * Add a new file to watch
     */
    public addWatchPath(configPath: string): void {
        if (!this.options.configPaths.includes(configPath)) {
            this.options.configPaths.push(configPath);

            if (this.isWatching) {
                if (fs.existsSync(configPath)) {
                    this.watchFile(configPath);
                    this.updateLastModified(configPath);
                } else {
                    const dirPath = path.dirname(configPath);
                    if (fs.existsSync(dirPath)) {
                        this.watchDirectory(dirPath, configPath);
                    }
                }
            }
        }
    }

    /**
     * Remove a file from being watched
     */
    public removeWatchPath(configPath: string): void {
        const index = this.options.configPaths.indexOf(configPath);
        if (index !== -1) {
            this.options.configPaths.splice(index, 1);

            // Close watcher if it exists
            if (this.watchers.has(configPath)) {
                this.watchers.get(configPath)?.close();
                this.watchers.delete(configPath);
            }

            // Clear debounce timer if it exists
            if (this.debounceTimers.has(configPath)) {
                clearTimeout(this.debounceTimers.get(configPath));
                this.debounceTimers.delete(configPath);
            }

            this.lastModified.delete(configPath);
        }
    }

    /**
     * Get the list of files being watched
     */
    public getWatchPaths(): string[] {
        return [...this.options.configPaths];
    }

    /**
     * Check if a file has been modified since last check
     */
    public async checkModified(configPath: string): Promise<boolean> {
        if (!fs.existsSync(configPath)) {
            return false;
        }

        try {
            const stats = await fs.promises.stat(configPath);
            const currentModified = stats.mtime.getTime();
            const lastModified = this.lastModified.get(configPath) || 0;

            if (currentModified > lastModified) {
                this.lastModified.set(configPath, currentModified);
                return true;
            }

            return false;
        } catch (error) {
            console.warn(`Failed to check file modification time for ${configPath}:`, error);
            return false;
        }
    }

    /**
     * Watch a specific file for changes
     */
    private watchFile(filePath: string): void {
        try {
            // Close existing watcher if there is one
            if (this.watchers.has(filePath)) {
                this.watchers.get(filePath)?.close();
            }

            const watcher = fs.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    this.handleFileChange(filePath);
                }
            });

            this.watchers.set(filePath, watcher);
        } catch (error) {
            console.warn(`Failed to set up file watcher for ${filePath}:`, error);
        }
    }

    /**
     * Watch a directory for file creation
     */
    private watchDirectory(dirPath: string, targetFilePath: string): void {
        try {
            const watcher = fs.watch(dirPath, (eventType, filename) => {
                if (!filename) return;
                const fullPath = path.join(dirPath, filename);

                if (fullPath === targetFilePath && eventType === 'rename' && fs.existsSync(fullPath)) {
                    // File was created, start watching it
                    this.watchFile(targetFilePath);
                    this.updateLastModified(targetFilePath);
                    this.handleFileChange(targetFilePath);
                }
            });

            // Store the directory watcher with the target file path as the key
            this.watchers.set(`dir:${targetFilePath}`, watcher);
        } catch (error) {
            console.warn(`Failed to set up directory watcher for ${dirPath}:`, error);
        }
    }

    /**
     * Handle file change event with debouncing
     */
    private handleFileChange(filePath: string): void {
        // Clear existing timer if there is one
        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath));
        }

        // Set a new timer
        const timer = setTimeout(async () => {
            try {
                const hasChanged = await this.checkModified(filePath);
                if (hasChanged) {
                    this.emit('change', filePath);
                }
            } catch (error) {
                console.error(`Error handling file change for ${filePath}:`, error);
            }
        }, this.options.debounceMs);

        this.debounceTimers.set(filePath, timer);
    }

    /**
     * Update the last modified time for a file
     */
    private updateLastModified(filePath: string): void {
        try {
            const stats = fs.statSync(filePath);
            this.lastModified.set(filePath, stats.mtime.getTime());
        } catch (error) {
            console.warn(`Failed to update last modified time for ${filePath}:`, error);
        }
    }

    /**
     * Clean up resources
     */
    public destroy(): void {
        this.stop();
        this.removeAllListeners();
    }
}