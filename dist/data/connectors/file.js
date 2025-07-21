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
exports.FileConnector = void 0;
const fs = __importStar(require("fs/promises"));
const mammoth = __importStar(require("mammoth"));
const marked_1 = require("marked");
const path = __importStar(require("path"));
const content_1 = require("../../models/content");
const errors_1 = require("../../utils/errors");
const base_1 = require("./base");
const fsSync = require('fs');
class FileConnector extends base_1.DataSourceConnector {
    constructor(dataSource) {
        super(dataSource);
        this.watchedFiles = new Map();
        this.supportedExtensions = new Set(['.pdf', '.txt', '.md', '.docx', '.doc']);
        this.fileWatchers = new Map();
        this.changeCallbacks = new Set();
        this.isWatching = false;
        this.config = dataSource.config;
        this.validateFileConfig();
    }
    async connect() {
        try {
            this.validateConfig();
            await this.validateFilePath();
            this.isConnected = true;
            if (this.config.watchForChanges) {
                await this.startFileWatching();
            }
            this.logOperation('info', 'Connected to file data source');
        }
        catch (error) {
            this.handleError(error, 'connect');
        }
    }
    async disconnect() {
        await this.stopFileWatching();
        this.isConnected = false;
        this.watchedFiles.clear();
        this.changeCallbacks.clear();
        this.logOperation('info', 'Disconnected from file data source');
    }
    async validateConnection() {
        try {
            await this.validateFilePath();
            return true;
        }
        catch (error) {
            this.logOperation('warn', 'Connection validation failed', { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }
    async sync(incremental = false) {
        const startTime = Date.now();
        const result = {
            success: false,
            documentsProcessed: 0,
            documentsAdded: 0,
            documentsUpdated: 0,
            documentsDeleted: 0,
            errors: [],
            duration: 0
        };
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            const files = await this.discoverFiles();
            this.logOperation('info', `Discovered ${files.length} files for processing`);
            for (const filePath of files) {
                try {
                    const shouldProcess = incremental ? await this.shouldProcessFile(filePath) : true;
                    if (shouldProcess) {
                        await this.processFile(filePath);
                        result.documentsProcessed++;
                        result.documentsAdded++;
                        const stats = await fs.stat(filePath);
                        this.watchedFiles.set(filePath, stats.mtime);
                    }
                }
                catch (error) {
                    const errorMsg = `Failed to process file ${filePath}: ${error instanceof Error ? error.message : String(error)}`;
                    result.errors.push(errorMsg);
                    this.logOperation('error', errorMsg);
                }
            }
            result.success = result.errors.length === 0;
            result.duration = Date.now() - startTime;
            this.logOperation('info', 'File sync completed', {
                documentsProcessed: result.documentsProcessed,
                documentsAdded: result.documentsAdded,
                errors: result.errors.length,
                duration: result.duration
            });
            return result;
        }
        catch (error) {
            result.success = false;
            result.duration = Date.now() - startTime;
            this.handleError(error, 'sync');
        }
    }
    async getContent(lastSync) {
        try {
            if (!this.isConnected) {
                await this.connect();
            }
            const files = await this.discoverFiles();
            const contents = [];
            for (const filePath of files) {
                try {
                    if (lastSync) {
                        const stats = await fs.stat(filePath);
                        if (stats.mtime <= lastSync) {
                            continue;
                        }
                    }
                    const parsedContent = await this.parseFile(filePath);
                    const content = this.createContentFromFile(parsedContent);
                    contents.push(content);
                }
                catch (error) {
                    this.logOperation('warn', `Failed to get content from file ${filePath}`, {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }
            return contents;
        }
        catch (error) {
            this.handleError(error, 'getContent');
        }
    }
    validateFileConfig() {
        if (!this.config.filePath) {
            throw new errors_1.ValidationError('File path is required for file data source', this.dataSource.id);
        }
        if (this.config.fileTypes && this.config.fileTypes.length > 0) {
            const invalidTypes = this.config.fileTypes.filter(type => !['pdf', 'txt', 'md', 'docx', 'doc'].includes(type.toLowerCase()));
            if (invalidTypes.length > 0) {
                throw new errors_1.ValidationError(`Unsupported file types: ${invalidTypes.join(', ')}. Supported types: pdf, txt, md, docx, doc`, this.dataSource.id);
            }
        }
    }
    async validateFilePath() {
        try {
            const stats = await fs.stat(this.config.filePath);
            if (!stats.isFile() && !stats.isDirectory()) {
                throw new errors_1.ValidationError(`Path ${this.config.filePath} is neither a file nor a directory`, this.dataSource.id);
            }
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                throw new errors_1.ValidationError(`File or directory not found: ${this.config.filePath}`, this.dataSource.id);
            }
            throw error;
        }
    }
    async discoverFiles() {
        const files = [];
        const stats = await fs.stat(this.config.filePath);
        if (stats.isFile()) {
            if (this.isFileSupported(this.config.filePath)) {
                files.push(this.config.filePath);
            }
        }
        else if (stats.isDirectory()) {
            await this.discoverFilesInDirectory(this.config.filePath, files);
        }
        return files;
    }
    async discoverFilesInDirectory(dirPath, files) {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (this.config.excludePatterns && this.isExcluded(fullPath)) {
                    continue;
                }
                if (entry.isFile() && this.isFileSupported(fullPath)) {
                    files.push(fullPath);
                }
                else if (entry.isDirectory() && this.config.recursive) {
                    await this.discoverFilesInDirectory(fullPath, files);
                }
            }
        }
        catch (error) {
            this.logOperation('warn', `Failed to read directory ${dirPath}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    isFileSupported(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (!this.supportedExtensions.has(ext)) {
            return false;
        }
        if (this.config.fileTypes && this.config.fileTypes.length > 0) {
            const fileType = ext.substring(1);
            return this.config.fileTypes.includes(fileType);
        }
        return true;
    }
    isExcluded(filePath) {
        if (!this.config.excludePatterns) {
            return false;
        }
        return this.config.excludePatterns.some(pattern => {
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
            return regex.test(filePath);
        });
    }
    async shouldProcessFile(filePath) {
        try {
            const stats = await fs.stat(filePath);
            const lastProcessed = this.watchedFiles.get(filePath);
            return !lastProcessed || stats.mtime > lastProcessed;
        }
        catch (error) {
            return true;
        }
    }
    async processFile(filePath) {
        const parsedContent = await this.parseFile(filePath);
        this.logOperation('debug', `Processed file: ${parsedContent.title}`, {
            filePath,
            textLength: parsedContent.text.length
        });
    }
    async parseFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const stats = await fs.stat(filePath);
        const baseMetadata = {
            fileName: path.basename(filePath),
            filePath,
            fileSize: stats.size,
            lastModified: stats.mtime,
            fileType: ext.substring(1)
        };
        let text;
        let title = path.basename(filePath, ext);
        try {
            switch (ext) {
                case '.pdf':
                    text = await this.parsePDF(filePath);
                    break;
                case '.docx':
                case '.doc':
                    text = await this.parseDocx(filePath);
                    break;
                case '.md':
                    text = await this.parseMarkdown(filePath);
                    break;
                case '.txt':
                    text = await this.parseText(filePath);
                    break;
                default:
                    throw new errors_1.ParseError(`Unsupported file type: ${ext}`, this.dataSource.id);
            }
            return {
                text: text.trim(),
                metadata: baseMetadata,
                title
            };
        }
        catch (error) {
            throw new errors_1.ParseError(`Failed to parse ${ext} file ${filePath}: ${error instanceof Error ? error.message : String(error)}`, this.dataSource.id);
        }
    }
    async parsePDF(filePath) {
        const pdfParse = require('pdf-parse');
        const buffer = await fs.readFile(filePath);
        const data = await pdfParse(buffer);
        return data.text;
    }
    async parseDocx(filePath) {
        const buffer = await fs.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }
    async parseMarkdown(filePath) {
        const content = await fs.readFile(filePath, 'utf-8');
        const html = await (0, marked_1.marked)(content);
        return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    }
    async parseText(filePath) {
        return await fs.readFile(filePath, 'utf-8');
    }
    createContentFromFile(parsedContent) {
        return new content_1.ContentModel({
            sourceId: this.dataSource.id,
            title: parsedContent.title,
            text: parsedContent.text,
            metadata: {
                fileType: parsedContent.metadata.fileType,
                fileName: parsedContent.metadata.fileName,
                filePath: parsedContent.metadata.filePath,
                fileSize: parsedContent.metadata.fileSize,
                modifiedAt: parsedContent.metadata.lastModified
            },
            embedding: [],
            chunks: []
        }).toJSON();
    }
    async startFileWatching() {
        if (this.isWatching) {
            return;
        }
        try {
            const stats = await fs.stat(this.config.filePath);
            if (stats.isFile()) {
                await this.watchFile(this.config.filePath);
            }
            else if (stats.isDirectory()) {
                await this.watchDirectory(this.config.filePath);
            }
            this.isWatching = true;
            this.logOperation('info', 'Started file system monitoring', {
                path: this.config.filePath,
                watchersCount: this.fileWatchers.size
            });
        }
        catch (error) {
            this.logOperation('error', 'Failed to start file watching', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }
    async stopFileWatching() {
        if (!this.isWatching) {
            return;
        }
        for (const [path, watcher] of this.fileWatchers) {
            try {
                watcher.close();
                this.logOperation('debug', `Closed file watcher for ${path}`);
            }
            catch (error) {
                this.logOperation('warn', `Failed to close watcher for ${path}`, {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
        this.fileWatchers.clear();
        this.isWatching = false;
        this.logOperation('info', 'Stopped file system monitoring');
    }
    async watchFile(filePath) {
        if (this.fileWatchers.has(filePath)) {
            return;
        }
        try {
            const watcher = fsSync.watch(filePath, { persistent: false }, (eventType, _filename) => {
                this.handleFileWatchEvent(eventType, filePath);
            });
            watcher.on('error', (error) => {
                this.logOperation('error', `File watcher error for ${filePath}`, {
                    error: error.message
                });
                this.fileWatchers.delete(filePath);
            });
            this.fileWatchers.set(filePath, watcher);
            this.logOperation('debug', `Started watching file: ${filePath}`);
        }
        catch (error) {
            this.logOperation('warn', `Failed to watch file ${filePath}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    async watchDirectory(dirPath) {
        if (this.fileWatchers.has(dirPath)) {
            return;
        }
        try {
            const watcher = fsSync.watch(dirPath, { persistent: false, recursive: this.config.recursive }, (eventType, filename) => {
                if (filename) {
                    const fullPath = path.join(dirPath, filename);
                    this.handleFileWatchEvent(eventType, fullPath);
                }
            });
            watcher.on('error', (error) => {
                this.logOperation('error', `Directory watcher error for ${dirPath}`, {
                    error: error.message
                });
                this.fileWatchers.delete(dirPath);
            });
            this.fileWatchers.set(dirPath, watcher);
            this.logOperation('debug', `Started watching directory: ${dirPath}`, {
                recursive: this.config.recursive
            });
        }
        catch (error) {
            this.logOperation('warn', `Failed to watch directory ${dirPath}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }
    handleFileWatchEvent(eventType, filePath) {
        if (!this.isFileSupported(filePath)) {
            return;
        }
        if (this.config.excludePatterns && this.isExcluded(filePath)) {
            return;
        }
        let mappedEventType;
        switch (eventType) {
            case 'rename':
                mappedEventType = fsSync.existsSync(filePath) ? 'add' : 'unlink';
                break;
            case 'change':
                mappedEventType = 'change';
                break;
            default:
                mappedEventType = 'change';
        }
        const event = {
            eventType: mappedEventType,
            filePath,
            timestamp: new Date()
        };
        this.logOperation('debug', `File system event: ${event.eventType}`, {
            filePath: event.filePath,
            timestamp: event.timestamp
        });
        this.changeCallbacks.forEach(callback => {
            try {
                callback(event);
            }
            catch (error) {
                this.logOperation('error', 'Error in file change callback', {
                    error: error instanceof Error ? error.message : String(error),
                    filePath: event.filePath
                });
            }
        });
        if (event.eventType === 'unlink') {
            this.watchedFiles.delete(filePath);
        }
        else {
            this.updateFileTimestamp(filePath);
        }
    }
    async updateFileTimestamp(filePath) {
        try {
            const stats = await fs.stat(filePath);
            this.watchedFiles.set(filePath, stats.mtime);
        }
        catch (error) {
            this.watchedFiles.delete(filePath);
        }
    }
    onFileChange(callback) {
        this.changeCallbacks.add(callback);
    }
    offFileChange(callback) {
        this.changeCallbacks.delete(callback);
    }
    isFileWatchingEnabled() {
        return this.isWatching;
    }
    getWatchedPaths() {
        return Array.from(this.fileWatchers.keys());
    }
    triggerFileChangeEvent(filePath, eventType) {
        if (!this.isFileSupported(filePath)) {
            return;
        }
        if (this.config.excludePatterns && this.isExcluded(filePath)) {
            return;
        }
        const event = {
            eventType,
            filePath,
            timestamp: new Date()
        };
        this.changeCallbacks.forEach(callback => {
            try {
                callback(event);
            }
            catch (error) {
                this.logOperation('error', 'Error in manual file change callback', {
                    error: error instanceof Error ? error.message : String(error),
                    filePath: event.filePath
                });
            }
        });
    }
}
exports.FileConnector = FileConnector;
//# sourceMappingURL=file.js.map