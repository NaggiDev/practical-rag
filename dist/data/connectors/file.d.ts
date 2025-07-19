import { Content } from '../../models/content';
import { DataSource, FileDataSourceConfig } from '../../models/dataSource';
import { DataSourceConnector, SyncResult } from './base';
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
export declare class FileConnector extends DataSourceConnector {
    protected readonly config: FileDataSourceConfig;
    private watchedFiles;
    private supportedExtensions;
    private fileWatchers;
    private changeCallbacks;
    private isWatching;
    constructor(dataSource: DataSource);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    validateConnection(): Promise<boolean>;
    sync(incremental?: boolean): Promise<SyncResult>;
    getContent(lastSync?: Date): Promise<Content[]>;
    private validateFileConfig;
    private validateFilePath;
    private discoverFiles;
    private discoverFilesInDirectory;
    private isFileSupported;
    private isExcluded;
    private shouldProcessFile;
    private processFile;
    private parseFile;
    private parsePDF;
    private parseDocx;
    private parseMarkdown;
    private parseText;
    private createContentFromFile;
    private startFileWatching;
    private stopFileWatching;
    private watchFile;
    private watchDirectory;
    private handleFileWatchEvent;
    private updateFileTimestamp;
    onFileChange(callback: FileChangeCallback): void;
    offFileChange(callback: FileChangeCallback): void;
    isFileWatchingEnabled(): boolean;
    getWatchedPaths(): string[];
    triggerFileChangeEvent(filePath: string, eventType: 'add' | 'change' | 'unlink'): void;
}
//# sourceMappingURL=file.d.ts.map