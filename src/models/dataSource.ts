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