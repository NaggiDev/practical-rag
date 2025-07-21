import { Content } from '../../models/content';
import { DataSource } from '../../models/dataSource';
import { DataSourceConnector, SyncResult } from './base';
export declare class APIConnector extends DataSourceConnector {
    private axiosInstance;
    private apiConfig;
    private rateLimiter;
    constructor(dataSource: DataSource);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    validateConnection(): Promise<boolean>;
    sync(incremental?: boolean): Promise<SyncResult>;
    getContent(lastSync?: Date): Promise<Content[]>;
    private buildRequestConfig;
    private makeRequest;
    private addAuthenticationHeaders;
    private parseResponse;
    private transformItemToContent;
    private extractPaginationInfo;
    private setupInterceptors;
    protected validateConfig(): void;
}
//# sourceMappingURL=api.d.ts.map