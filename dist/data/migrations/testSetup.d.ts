import { SystemConfig } from '../../models/config';
import { DatabaseSetup } from './setup';
export declare class TestDatabaseSetup extends DatabaseSetup {
    private testId;
    testConfig: SystemConfig;
    constructor(config: SystemConfig);
    private static createTestConfig;
    setupTestDatabase(): Promise<void>;
    teardownTestDatabase(): Promise<void>;
    private cleanupTestFiles;
    getTestId(): string;
}
export declare function setupTestDatabase(config: SystemConfig): Promise<TestDatabaseSetup>;
export declare function teardownTestDatabase(): Promise<void>;
export declare const jestSetup: () => Promise<void>;
export declare const jestTeardown: () => Promise<void>;
export declare function cleanupTestData(): Promise<void>;
//# sourceMappingURL=testSetup.d.ts.map