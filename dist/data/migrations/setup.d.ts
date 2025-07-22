import { SystemConfig } from '../../models/config';
export declare class DatabaseSetup {
    private migrationRunner;
    protected config: SystemConfig;
    constructor(config: SystemConfig);
    setupDatabase(): Promise<void>;
    teardownDatabase(): Promise<void>;
    close(): Promise<void>;
}
export declare function runSetup(): Promise<void>;
export declare function runTeardown(): Promise<void>;
//# sourceMappingURL=setup.d.ts.map