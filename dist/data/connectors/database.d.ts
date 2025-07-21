import { Content } from '../../models/content';
import { DataSource, DatabaseDataSourceConfig } from '../../models/dataSource';
import { DataSourceConnector, SyncResult } from './base';
export interface DatabaseMetadata {
    tableName?: string;
    query?: string;
    lastSyncTimestamp?: Date;
    recordCount: number;
    schema?: string;
    database?: string;
}
export interface DatabaseRecord {
    id: string | number;
    content: string;
    title?: string;
    metadata?: Record<string, any>;
    created_at?: Date;
    updated_at?: Date;
}
export interface ConnectionPool {
    acquire(): Promise<any>;
    release(connection: any): Promise<void>;
    destroy(): Promise<void>;
    size(): number;
    available(): number;
}
export type DatabaseType = 'postgresql' | 'mysql' | 'mongodb' | 'sqlite';
export declare class DatabaseConnector extends DataSourceConnector {
    protected readonly config: DatabaseDataSourceConfig;
    private dbType;
    private pgPool;
    private mongoClient;
    private mongoDb;
    private changeStream;
    private lastSyncTimestamp;
    constructor(dataSource: DataSource);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    validateConnection(): Promise<boolean>;
    sync(incremental?: boolean): Promise<SyncResult>;
    getContent(lastSync?: Date): Promise<Content[]>;
    private detectDatabaseType;
    private validateDatabaseConfig;
    private connectPostgreSQL;
    private connectMongoDB;
    private validatePostgreSQLConnection;
    private validateMongoDBConnection;
    private fetchRecords;
    private fetchPostgreSQLRecords;
    private fetchMongoDBRecords;
    private mapPostgreSQLRowToRecord;
    private mapMongoDocumentToRecord;
    private createContentFromRecord;
    private extractDatabaseName;
    getDatabaseMetadata(): Promise<DatabaseMetadata>;
    private getPostgreSQLMetadata;
    private getMongoDBMetadata;
    getPoolStats(): {
        total: number;
        idle: number;
        waiting: number;
    };
}
//# sourceMappingURL=database.d.ts.map