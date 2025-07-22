import { SystemConfig } from '../../models/config';
export interface Migration {
    id: string;
    name: string;
    up: (config: SystemConfig) => Promise<void>;
    down: (config: SystemConfig) => Promise<void>;
}
export declare class MigrationRunner {
    private config;
    private db;
    constructor(config: SystemConfig);
    private getMetadataDb;
    private initializeMigrationTable;
    private getExecutedMigrations;
    private recordMigration;
    private removeMigrationRecord;
    runMigrations(migrations: Migration[]): Promise<void>;
    rollbackMigration(migration: Migration): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=migrationRunner.d.ts.map