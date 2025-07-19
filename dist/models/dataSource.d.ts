export type DataSourceType = 'file' | 'database' | 'api';
export type DataSourceStatus = 'active' | 'inactive' | 'error' | 'syncing';
export interface DataSourceConfig {
    connectionString?: string;
    apiEndpoint?: string;
    filePath?: string;
    credentials?: {
        username?: string;
        password?: string;
        apiKey?: string;
        token?: string;
    };
    syncInterval?: number;
    batchSize?: number;
    timeout?: number;
    retryAttempts?: number;
}
export interface FileDataSourceConfig extends DataSourceConfig {
    filePath: string;
    fileTypes?: string[];
    watchForChanges?: boolean;
    recursive?: boolean;
    excludePatterns?: string[];
}
export interface DatabaseDataSourceConfig extends DataSourceConfig {
    connectionString: string;
    query?: string;
    table?: string;
    incrementalField?: string;
    credentials: {
        username: string;
        password: string;
    };
}
export interface ApiDataSourceConfig extends DataSourceConfig {
    apiEndpoint: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    queryParams?: Record<string, string>;
    credentials?: {
        apiKey?: string;
        token?: string;
        username?: string;
        password?: string;
    };
    pagination?: {
        type: 'offset' | 'cursor' | 'page';
        limitParam?: string;
        offsetParam?: string;
        cursorParam?: string;
        pageParam?: string;
    };
}
export interface DataSource {
    id: string;
    name: string;
    type: DataSourceType;
    config: DataSourceConfig;
    status: DataSourceStatus;
    lastSync: Date;
    documentCount: number;
    errorMessage?: string;
    metadata?: object;
}
export interface DataSourceHealth {
    sourceId: string;
    isHealthy: boolean;
    lastCheck: Date;
    responseTime?: number;
    errorCount: number;
    lastError?: string;
}
export declare class DataSourceConfigModel {
    readonly config: DataSourceConfig;
    readonly type: DataSourceType;
    constructor(config: DataSourceConfig, type: DataSourceType);
    private validateAndSanitize;
    private sanitizeConfig;
    private validateByType;
    private validateTypeSpecificConstraints;
    private validateFileConfig;
    private validateDatabaseConfig;
    private validateApiConfig;
    static createFileConfig(config: Partial<FileDataSourceConfig>): DataSourceConfigModel;
    static createDatabaseConfig(config: Partial<DatabaseDataSourceConfig>): DataSourceConfigModel;
    static createApiConfig(config: Partial<ApiDataSourceConfig>): DataSourceConfigModel;
    toJSON(): DataSourceConfig;
    static fromJSON(data: any, type: DataSourceType): DataSourceConfigModel;
}
export declare class DataSourceModel implements DataSource {
    readonly id: string;
    readonly name: string;
    readonly type: DataSourceType;
    readonly config: DataSourceConfig;
    readonly status: DataSourceStatus;
    readonly lastSync: Date;
    readonly documentCount: number;
    readonly errorMessage?: string;
    readonly metadata?: object;
    constructor(data: Partial<DataSource>);
    private sanitize;
    private sanitizeConfig;
    private validate;
    toJSON(): DataSource;
    static fromJSON(data: any): DataSourceModel;
    updateStatus(status: DataSourceStatus, errorMessage?: string): DataSourceModel;
    updateDocumentCount(count: number): DataSourceModel;
}
//# sourceMappingURL=dataSource.d.ts.map