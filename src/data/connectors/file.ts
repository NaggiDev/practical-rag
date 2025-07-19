import * as fs from 'fs/promises';
import * as mammoth from 'mammoth';
import { marked } from 'marked';
import * as path from 'path';
import { Content, ContentModel } from '../../models/content';
import { DataSource, FileDataSourceConfig } from '../../models/dataSource';
import { ParseError, ValidationError } from '../../utils/errors';
import { DataSourceConnector, SyncResult } from './base';

const fsSync = require('fs');

export interface FileMetadata {
    fileName: string;
    filePath: string;
    fileSize: number;
    lastModified: Date;
    fileType: string;
    encoding?: string;
}

export interface ParsedFileContent {
    text: string;
    metadata: FileMetadata;
    title: string;
}

export interface FileWatchEvent {
    eventType: 'add' | 'change' | 'unlink';
    filePath: string;
    timestamp: Date;
}

export type FileChangeCallback = (event: FileWatchEvent) => void;

/**
 * File-based data source connector
 * Supports PDF, TXT, MD, DOCX file parsing with file system monitoring
 */
export class FileConnector extends DataSourceConnector {
    protected override readonly config: FileDataSourceConfig;
    private watchedFiles: Map<string, Date> = new Map();
    private supportedExtensions = new Set(['.pdf', '.txt', '.md', '.docx', '.doc']);
    private fileWatchers: Map<string, any> = new Map();
    private changeCallbacks: Set<FileChangeCallback> = new Set();
    private isWatching: boolean = false;

    constructor(dataSource: DataSource) {
        super(dataSource);
        this.config = dataSource.config as FileDataSourceConfig;
        this.validateFileConfig();
    }

    /**
     * Connect to the file system and validate file paths
     */
    public async connect(): Promise<void> {
        try {
            this.validateConfig();
            await this.validateFilePath();
            this.isConnected = true;

            // Start file system monitoring if enabled
            if (this.config.watchForChanges) {
                await this.startFileWatching();
            }

            this.logOperation('info', 'Connected to file data source');
        } catch (error) {
            this.handleError(error, 'connect');
        }
    }

    /**
     * Disconnect from file system (cleanup watchers if any)
     */
    public async disconnect(): Promise<void> {
        await this.stopFileWatching();
        this.isConnected = false;
        this.watchedFiles.clear();
        this.changeCallbacks.clear();
        this.logOperation('info', 'Disconnected from file data source');
    }

    /**
     * Validate connection by checking file/directory accessibility
     */
    public async validateConnection(): Promise<boolean> {
        try {
            await this.validateFilePath();
            return true;
        } catch (error) {
            this.logOperation('warn', 'Connection validation failed', { error: error instanceof Error ? error.message : String(error) });
            return false;
        }
    }

    /**
     * Sync files from the configured path
     */
    public async sync(incremental: boolean = false): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
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
                        result.documentsAdded++; // For simplicity, treating all as added

                        // Update watched files
                        const stats = await fs.stat(filePath);
                        this.watchedFiles.set(filePath, stats.mtime);
                    }
                } catch (error) {
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
        } catch (error) {
            result.success = false;
            result.duration = Date.now() - startTime;
            this.handleError(error, 'sync');
        }
    }

    /**
     * Get content from files
     */
    public async getContent(lastSync?: Date): Promise<Content[]> {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const files = await this.discoverFiles();
            const contents: Content[] = [];

            for (const filePath of files) {
                try {
                    // Check if file was modified after lastSync
                    if (lastSync) {
                        const stats = await fs.stat(filePath);
                        if (stats.mtime <= lastSync) {
                            continue;
                        }
                    }

                    const parsedContent = await this.parseFile(filePath);
                    const content = this.createContentFromFile(parsedContent);
                    contents.push(content);
                } catch (error) {
                    this.logOperation('warn', `Failed to get content from file ${filePath}`, {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            return contents;
        } catch (error) {
            this.handleError(error, 'getContent');
        }
    }

    /**
     * Validate file-specific configuration
     */
    private validateFileConfig(): void {
        if (!this.config.filePath) {
            throw new ValidationError('File path is required for file data source', this.dataSource.id);
        }

        if (this.config.fileTypes && this.config.fileTypes.length > 0) {
            const invalidTypes = this.config.fileTypes.filter(type =>
                !['pdf', 'txt', 'md', 'docx', 'doc'].includes(type.toLowerCase())
            );

            if (invalidTypes.length > 0) {
                throw new ValidationError(
                    `Unsupported file types: ${invalidTypes.join(', ')}. Supported types: pdf, txt, md, docx, doc`,
                    this.dataSource.id
                );
            }
        }
    }

    /**
     * Validate file path accessibility
     */
    private async validateFilePath(): Promise<void> {
        try {
            const stats = await fs.stat(this.config.filePath);

            if (!stats.isFile() && !stats.isDirectory()) {
                throw new ValidationError(
                    `Path ${this.config.filePath} is neither a file nor a directory`,
                    this.dataSource.id
                );
            }
        } catch (error) {
            if ((error as any).code === 'ENOENT') {
                throw new ValidationError(
                    `File or directory not found: ${this.config.filePath}`,
                    this.dataSource.id
                );
            }
            throw error;
        }
    }

    /**
     * Discover files to process based on configuration
     */
    private async discoverFiles(): Promise<string[]> {
        const files: string[] = [];
        const stats = await fs.stat(this.config.filePath);

        if (stats.isFile()) {
            if (this.isFileSupported(this.config.filePath)) {
                files.push(this.config.filePath);
            }
        } else if (stats.isDirectory()) {
            await this.discoverFilesInDirectory(this.config.filePath, files);
        }

        return files;
    }

    /**
     * Recursively discover files in directory
     */
    private async discoverFilesInDirectory(dirPath: string, files: string[]): Promise<void> {
        try {
            const entries = await fs.readdir(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                // Check exclude patterns
                if (this.config.excludePatterns && this.isExcluded(fullPath)) {
                    continue;
                }

                if (entry.isFile() && this.isFileSupported(fullPath)) {
                    files.push(fullPath);
                } else if (entry.isDirectory() && this.config.recursive) {
                    await this.discoverFilesInDirectory(fullPath, files);
                }
            }
        } catch (error) {
            this.logOperation('warn', `Failed to read directory ${dirPath}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Check if file is supported based on extension and configuration
     */
    private isFileSupported(filePath: string): boolean {
        const ext = path.extname(filePath).toLowerCase();

        if (!this.supportedExtensions.has(ext)) {
            return false;
        }

        if (this.config.fileTypes && this.config.fileTypes.length > 0) {
            const fileType = ext.substring(1); // Remove the dot
            return this.config.fileTypes.includes(fileType);
        }

        return true;
    }

    /**
     * Check if file path matches exclude patterns
     */
    private isExcluded(filePath: string): boolean {
        if (!this.config.excludePatterns) {
            return false;
        }

        return this.config.excludePatterns.some(pattern => {
            // Simple glob pattern matching (basic implementation)
            const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
            return regex.test(filePath);
        });
    }

    /**
     * Check if file should be processed in incremental sync
     */
    private async shouldProcessFile(filePath: string): Promise<boolean> {
        try {
            const stats = await fs.stat(filePath);
            const lastProcessed = this.watchedFiles.get(filePath);

            return !lastProcessed || stats.mtime > lastProcessed;
        } catch (error) {
            // If we can't stat the file, assume it should be processed
            return true;
        }
    }

    /**
     * Process a single file
     */
    private async processFile(filePath: string): Promise<void> {
        const parsedContent = await this.parseFile(filePath);
        // In a real implementation, this would save to a database or index
        this.logOperation('debug', `Processed file: ${parsedContent.title}`, {
            filePath,
            textLength: parsedContent.text.length
        });
    }

    /**
     * Parse file content based on file type
     */
    private async parseFile(filePath: string): Promise<ParsedFileContent> {
        const ext = path.extname(filePath).toLowerCase();
        const stats = await fs.stat(filePath);

        const baseMetadata: FileMetadata = {
            fileName: path.basename(filePath),
            filePath,
            fileSize: stats.size,
            lastModified: stats.mtime,
            fileType: ext.substring(1)
        };

        let text: string;
        let title: string = path.basename(filePath, ext);

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
                    throw new ParseError(`Unsupported file type: ${ext}`, this.dataSource.id);
            }

            return {
                text: text.trim(),
                metadata: baseMetadata,
                title
            };
        } catch (error) {
            throw new ParseError(
                `Failed to parse ${ext} file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
                this.dataSource.id
            );
        }
    }

    /**
     * Parse PDF file
     */
    private async parsePDF(filePath: string): Promise<string> {
        const pdfParse = require('pdf-parse');
        const buffer = await fs.readFile(filePath);
        const data = await pdfParse(buffer);
        return data.text;
    }

    /**
     * Parse DOCX file
     */
    private async parseDocx(filePath: string): Promise<string> {
        const buffer = await fs.readFile(filePath);
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }

    /**
     * Parse Markdown file
     */
    private async parseMarkdown(filePath: string): Promise<string> {
        const content = await fs.readFile(filePath, 'utf-8');
        // Convert markdown to plain text by parsing and extracting text content
        const html = await marked(content);
        // Simple HTML tag removal (in production, consider using a proper HTML parser)
        return html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim();
    }

    /**
     * Parse text file
     */
    private async parseText(filePath: string): Promise<string> {
        return await fs.readFile(filePath, 'utf-8');
    }

    /**
     * Create Content model from parsed file
     */
    private createContentFromFile(parsedContent: ParsedFileContent): Content {
        return new ContentModel({
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
            embedding: [], // Will be populated by embedding service
            chunks: [] // Will be populated by indexing service
        }).toJSON();
    }

    /**
     * Start file system monitoring for automatic updates
     */
    private async startFileWatching(): Promise<void> {
        if (this.isWatching) {
            return;
        }

        try {
            const stats = await fs.stat(this.config.filePath);

            if (stats.isFile()) {
                await this.watchFile(this.config.filePath);
            } else if (stats.isDirectory()) {
                await this.watchDirectory(this.config.filePath);
            }

            this.isWatching = true;
            this.logOperation('info', 'Started file system monitoring', {
                path: this.config.filePath,
                watchersCount: this.fileWatchers.size
            });
        } catch (error) {
            this.logOperation('error', 'Failed to start file watching', {
                error: error instanceof Error ? error.message : String(error)
            });
            throw error;
        }
    }

    /**
     * Stop file system monitoring
     */
    private async stopFileWatching(): Promise<void> {
        if (!this.isWatching) {
            return;
        }

        // Close all watchers
        for (const [path, watcher] of this.fileWatchers) {
            try {
                watcher.close();
                this.logOperation('debug', `Closed file watcher for ${path}`);
            } catch (error) {
                this.logOperation('warn', `Failed to close watcher for ${path}`, {
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        this.fileWatchers.clear();
        this.isWatching = false;
        this.logOperation('info', 'Stopped file system monitoring');
    }

    /**
     * Watch a single file for changes
     */
    private async watchFile(filePath: string): Promise<void> {
        if (this.fileWatchers.has(filePath)) {
            return;
        }

        try {
            const watcher = fsSync.watch(filePath, { persistent: false }, (eventType: string, _filename: string) => {
                this.handleFileWatchEvent(eventType, filePath);
            });

            watcher.on('error', (error: Error) => {
                this.logOperation('error', `File watcher error for ${filePath}`, {
                    error: error.message
                });
                this.fileWatchers.delete(filePath);
            });

            this.fileWatchers.set(filePath, watcher);
            this.logOperation('debug', `Started watching file: ${filePath}`);
        } catch (error) {
            this.logOperation('warn', `Failed to watch file ${filePath}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Watch a directory for changes (recursively if configured)
     */
    private async watchDirectory(dirPath: string): Promise<void> {
        if (this.fileWatchers.has(dirPath)) {
            return;
        }

        try {
            const watcher = fsSync.watch(dirPath, { persistent: false, recursive: this.config.recursive }, (eventType: string, filename: string) => {
                if (filename) {
                    const fullPath = path.join(dirPath, filename);
                    this.handleFileWatchEvent(eventType, fullPath);
                }
            });

            watcher.on('error', (error: Error) => {
                this.logOperation('error', `Directory watcher error for ${dirPath}`, {
                    error: error.message
                });
                this.fileWatchers.delete(dirPath);
            });

            this.fileWatchers.set(dirPath, watcher);
            this.logOperation('debug', `Started watching directory: ${dirPath}`, {
                recursive: this.config.recursive
            });
        } catch (error) {
            this.logOperation('warn', `Failed to watch directory ${dirPath}`, {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Handle file system watch events
     */
    private handleFileWatchEvent(eventType: string, filePath: string): void {
        // Filter out non-supported files
        if (!this.isFileSupported(filePath)) {
            return;
        }

        // Check exclude patterns
        if (this.config.excludePatterns && this.isExcluded(filePath)) {
            return;
        }

        // Map fs.watch event types to our event types
        let mappedEventType: 'add' | 'change' | 'unlink';
        switch (eventType) {
            case 'rename':
                // For rename events, we need to check if the file still exists
                mappedEventType = fsSync.existsSync(filePath) ? 'add' : 'unlink';
                break;
            case 'change':
                mappedEventType = 'change';
                break;
            default:
                mappedEventType = 'change';
        }

        const event: FileWatchEvent = {
            eventType: mappedEventType,
            filePath,
            timestamp: new Date()
        };

        this.logOperation('debug', `File system event: ${event.eventType}`, {
            filePath: event.filePath,
            timestamp: event.timestamp
        });

        // Notify all registered callbacks
        this.changeCallbacks.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                this.logOperation('error', 'Error in file change callback', {
                    error: error instanceof Error ? error.message : String(error),
                    filePath: event.filePath
                });
            }
        });

        // Update internal tracking
        if (event.eventType === 'unlink') {
            this.watchedFiles.delete(filePath);
        } else {
            // For add/change events, update the timestamp
            this.updateFileTimestamp(filePath);
        }
    }

    /**
     * Update file timestamp in internal tracking
     */
    private async updateFileTimestamp(filePath: string): Promise<void> {
        try {
            const stats = await fs.stat(filePath);
            this.watchedFiles.set(filePath, stats.mtime);
        } catch (error) {
            // File might have been deleted between the event and this call
            this.watchedFiles.delete(filePath);
        }
    }

    /**
     * Register a callback for file change events
     */
    public onFileChange(callback: FileChangeCallback): void {
        this.changeCallbacks.add(callback);
    }

    /**
     * Unregister a file change callback
     */
    public offFileChange(callback: FileChangeCallback): void {
        this.changeCallbacks.delete(callback);
    }

    /**
     * Get the current file watching status
     */
    public isFileWatchingEnabled(): boolean {
        return this.isWatching;
    }

    /**
     * Get the list of currently watched paths
     */
    public getWatchedPaths(): string[] {
        return Array.from(this.fileWatchers.keys());
    }

    /**
     * Manually trigger a file change event (useful for testing)
     */
    public triggerFileChangeEvent(filePath: string, eventType: 'add' | 'change' | 'unlink'): void {
        // Apply the same filtering logic as real file watch events
        if (!this.isFileSupported(filePath)) {
            return;
        }

        if (this.config.excludePatterns && this.isExcluded(filePath)) {
            return;
        }

        const event: FileWatchEvent = {
            eventType,
            filePath,
            timestamp: new Date()
        };

        this.changeCallbacks.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                this.logOperation('error', 'Error in manual file change callback', {
                    error: error instanceof Error ? error.message : String(error),
                    filePath: event.filePath
                });
            }
        });
    }
}
