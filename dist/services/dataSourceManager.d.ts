import { DataSource, DataSourceHealth, DataSourceModel } from '../models/dataSource';
export interface PaginationOptions {
    page: number;
    limit: number;
    sort?: 'asc' | 'desc';
    sortBy?: string;
}
export interface PaginationResult<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}
export interface SyncResult {
    syncId: string;
    estimatedDuration: number;
    status: 'started' | 'queued' | 'failed';
}
export interface DataSourceManager {
    getActiveSources(): Promise<DataSource[]>;
    getAllSources(options: PaginationOptions): Promise<PaginationResult<DataSource>>;
    getSourceById(id: string): Promise<DataSource | null>;
    createSource(source: DataSourceModel): Promise<DataSource>;
    updateSource(id: string, source: DataSourceModel): Promise<DataSource>;
    deleteSource(id: string): Promise<boolean>;
    triggerSync(id: string): Promise<SyncResult>;
    checkHealth(id: string): Promise<DataSourceHealth>;
    validateSourceConnection(source: DataSourceModel): Promise<boolean>;
}
export declare class DataSourceManagerImpl implements DataSourceManager {
    private storage;
    getActiveSources(): Promise<DataSource[]>;
    getAllSources(options: PaginationOptions): Promise<PaginationResult<DataSource>>;
    getSourceById(id: string): Promise<DataSource | null>;
    createSource(source: DataSourceModel): Promise<DataSource>;
    updateSource(id: string, source: DataSourceModel): Promise<DataSource>;
    deleteSource(id: string): Promise<boolean>;
    triggerSync(id: string): Promise<SyncResult>;
    checkHealth(id: string): Promise<DataSourceHealth>;
    validateSourceConnection(source: DataSourceModel): Promise<boolean>;
}
//# sourceMappingURL=dataSourceManager.d.ts.map