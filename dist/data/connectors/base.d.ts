import { Content } from '../../models/content';
import { DataSource, DataSourceConfig, DataSourceHealth } from '../../models/dataSource';
export interface SyncResult {
    success: boolean;
    documentsProcessed: number;
    documentsAdded: number;
    documentsUpdated: number;
    documentsDeleted: number;
    errors: string[];
    duration: number;
}
export interface ConnectorMetrics {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageResponseTime: number;
    lastQueryTime?: Date;
}
export interface RetryOptions {
    maxAttempts: number;
    baseDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}
export declare abstract class DataSourceConnector {
    protected readonly dataSource: DataSource;
    protected readonly config: DataSourceConfig;
    protected isConnected: boolean;
    protected lastHealthCheck?: Date;
    protected metrics: ConnectorMetrics;
    protected retryOptions: RetryOptions;
    constructor(dataSource: DataSource);
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract validateConnection(): Promise<boolean>;
    abstract sync(incremental?: boolean): Promise<SyncResult>;
    abstract getContent(lastSync?: Date): Promise<Content[]>;
    healthCheck(): Promise<DataSourceHealth>;
    protected executeWithRetry<T>(operation: () => Promise<T>, options?: Partial<RetryOptions>): Promise<T>;
    protected executeWithTimeout<T>(operation: () => Promise<T>, timeoutMs?: number): Promise<T>;
    protected updateMetrics(success: boolean, responseTime: number): void;
    getMetrics(): ConnectorMetrics;
    resetMetrics(): void;
    getConnectionStatus(): boolean;
    getDataSource(): DataSource;
    getLastHealthCheck(): Date | undefined;
    protected validateConfig(): void;
    protected sleep(ms: number): Promise<void>;
    protected logOperation(level: 'debug' | 'info' | 'warn' | 'error', message: string, context?: object): void;
    protected handleError(error: unknown, operation: string): never;
}
//# sourceMappingURL=base.d.ts.map