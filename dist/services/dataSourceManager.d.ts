import { DataSource } from '../models/dataSource';
export interface DataSourceManager {
    getActiveSources(): Promise<DataSource[]>;
}
export declare class DataSourceManagerImpl implements DataSourceManager {
    getActiveSources(): Promise<DataSource[]>;
}
//# sourceMappingURL=dataSourceManager.d.ts.map