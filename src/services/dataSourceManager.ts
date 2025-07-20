import { DataSource } from '../models/dataSource';

// Basic interface for QueryProcessor dependency
export interface DataSourceManager {
    getActiveSources(): Promise<DataSource[]>;
}

// Placeholder implementation - will be fully implemented in later tasks
export class DataSourceManagerImpl implements DataSourceManager {
    async getActiveSources(): Promise<DataSource[]> {
        // Return empty array for now - will be implemented in task 3
        return [];
    }
}
