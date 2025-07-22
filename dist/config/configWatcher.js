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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigWatcher = void 0;
const events_1 = require("events");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class ConfigWatcher extends events_1.EventEmitter {
    constructor(options) {
        super();
        this.watchers = new Map();
        this.debounceTimers = new Map();
        this.lastModified = new Map();
        this.isWatching = false;
        this.options = {
            configPaths: options.configPaths,
            debounceMs: options.debounceMs || 300,
            enabled: options.enabled !== undefined ? options.enabled : true
        };
        if (this.options.enabled) {
            this.start();
        }
    }
    start() {
        if (this.isWatching)
            return;
        this.isWatching = true;
        for (const configPath of this.options.configPaths) {
            if (fs.existsSync(configPath)) {
                this.watchFile(configPath);
                this.updateLastModified(configPath);
            }
            else {
                const dirPath = path.dirname(configPath);
                if (fs.existsSync(dirPath)) {
                    this.watchDirectory(dirPath, configPath);
                }
            }
        }
    }
    stop() {
        if (!this.isWatching)
            return;
        this.isWatching = false;
        for (const watcher of this.watchers.values()) {
            watcher.close();
        }
        this.watchers.clear();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }
    addWatchPath(configPath) {
        if (!this.options.configPaths.includes(configPath)) {
            this.options.configPaths.push(configPath);
            if (this.isWatching) {
                if (fs.existsSync(configPath)) {
                    this.watchFile(configPath);
                    this.updateLastModified(configPath);
                }
                else {
                    const dirPath = path.dirname(configPath);
                    if (fs.existsSync(dirPath)) {
                        this.watchDirectory(dirPath, configPath);
                    }
                }
            }
        }
    }
    removeWatchPath(configPath) {
        const index = this.options.configPaths.indexOf(configPath);
        if (index !== -1) {
            this.options.configPaths.splice(index, 1);
            if (this.watchers.has(configPath)) {
                this.watchers.get(configPath)?.close();
                this.watchers.delete(configPath);
            }
            if (this.debounceTimers.has(configPath)) {
                clearTimeout(this.debounceTimers.get(configPath));
                this.debounceTimers.delete(configPath);
            }
            this.lastModified.delete(configPath);
        }
    }
    getWatchPaths() {
        return [...this.options.configPaths];
    }
    async checkModified(configPath) {
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
        }
        catch (error) {
            console.warn(`Failed to check file modification time for ${configPath}:`, error);
            return false;
        }
    }
    watchFile(filePath) {
        try {
            if (this.watchers.has(filePath)) {
                this.watchers.get(filePath)?.close();
            }
            const watcher = fs.watch(filePath, (eventType) => {
                if (eventType === 'change') {
                    this.handleFileChange(filePath);
                }
            });
            this.watchers.set(filePath, watcher);
        }
        catch (error) {
            console.warn(`Failed to set up file watcher for ${filePath}:`, error);
        }
    }
    watchDirectory(dirPath, targetFilePath) {
        try {
            const watcher = fs.watch(dirPath, (eventType, filename) => {
                if (!filename)
                    return;
                const fullPath = path.join(dirPath, filename);
                if (fullPath === targetFilePath && eventType === 'rename' && fs.existsSync(fullPath)) {
                    this.watchFile(targetFilePath);
                    this.updateLastModified(targetFilePath);
                    this.handleFileChange(targetFilePath);
                }
            });
            this.watchers.set(`dir:${targetFilePath}`, watcher);
        }
        catch (error) {
            console.warn(`Failed to set up directory watcher for ${dirPath}:`, error);
        }
    }
    handleFileChange(filePath) {
        if (this.debounceTimers.has(filePath)) {
            clearTimeout(this.debounceTimers.get(filePath));
        }
        const timer = setTimeout(async () => {
            try {
                const hasChanged = await this.checkModified(filePath);
                if (hasChanged) {
                    this.emit('change', filePath);
                }
            }
            catch (error) {
                console.error(`Error handling file change for ${filePath}:`, error);
            }
        }, this.options.debounceMs);
        this.debounceTimers.set(filePath, timer);
    }
    updateLastModified(filePath) {
        try {
            const stats = fs.statSync(filePath);
            this.lastModified.set(filePath, stats.mtime.getTime());
        }
        catch (error) {
            console.warn(`Failed to update last modified time for ${filePath}:`, error);
        }
    }
    destroy() {
        this.stop();
        this.removeAllListeners();
    }
}
exports.ConfigWatcher = ConfigWatcher;
//# sourceMappingURL=configWatcher.js.map