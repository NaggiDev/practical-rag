import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { SystemConfig } from '../../models/config';
import { logger } from '../../utils/logger';
import { DatabaseSetup } from './setup';

export class TestDatabaseSetup extends DatabaseSetup {
    private testId: string;
    public testConfig: SystemConfig;

    constructor(config: SystemConfig) {
        // Create test-specific configuration
        const testConfig = TestDatabaseSetup.createTestConfig(config);
        super(testConfig);

        this.testId = uuidv4().substring(0, 8);
        this.testConfig = testConfig;
    }

    private static createTestConfig(baseConfig: SystemConfig): SystemConfig {
        const testId = uuidv4().substring(0, 8);

        return {
            ...baseConfig,
            database: {
                ...baseConfig.database,
                metadata: {
                    ...baseConfig.database.metadata,
                    connectionString: `sqlite://./data/test/metadata_${testId}.db`
                },
                vector: {
                    ...baseConfig.database.vector,
                    indexName: `test-rag-index-${testId}`
                }
            },
            cache: {
                ...baseConfig.cache,
                redis: {
                    ...baseConfig.cache.redis,
                    db: 15 // Use test database
                }
            }
        };
    }

    async setupTestDatabase(): Promise<void> {
        logger.info(`Setting up test database (ID: ${this.testId})`);

        // Create test data directory
        const testDataDir = path.join(process.cwd(), 'data', 'test');
        await fs.mkdir(testDataDir, { recursive: true });

        // Run standard setup
        await this.setupDatabase();

        logger.info(`Test database setup completed (ID: ${this.testId})`);
    }

    async teardownTestDatabase(): Promise<void> {
        logger.info(`Tearing down test database (ID: ${this.testId})`);

        try {
            // Run standard teardown
            await this.teardownDatabase();

            // Clean up test files
            await this.cleanupTestFiles();

            logger.info(`Test database teardown completed (ID: ${this.testId})`);
        } catch (error) {
            logger.error(`Test database teardown failed (ID: ${this.testId})`, { error });
            throw error;
        }
    }

    private async cleanupTestFiles(): Promise<void> {
        try {
            const testDataDir = path.join(process.cwd(), 'data', 'test');

            // Remove test database files
            const files = await fs.readdir(testDataDir);
            for (const file of files) {
                if (file.includes(this.testId)) {
                    await fs.unlink(path.join(testDataDir, file));
                }
            }

            // Remove test vector index directory if it exists
            const testVectorDir = path.join(process.cwd(), 'data', 'test-vector-index');
            await fs.rm(testVectorDir, { recursive: true, force: true });

        } catch (error) {
            logger.warn('Failed to cleanup some test files', { error });
        }
    }

    getTestId(): string {
        return this.testId;
    }
}

// Global test setup and teardown functions
let globalTestSetup: TestDatabaseSetup | null = null;

export async function setupTestDatabase(config: SystemConfig): Promise<TestDatabaseSetup> {
    if (globalTestSetup) {
        await globalTestSetup.teardownTestDatabase();
    }

    globalTestSetup = new TestDatabaseSetup(config);
    await globalTestSetup.setupTestDatabase();

    return globalTestSetup;
}

export async function teardownTestDatabase(): Promise<void> {
    if (globalTestSetup) {
        await globalTestSetup.teardownTestDatabase();
        globalTestSetup = null;
    }
}

// Jest setup and teardown hooks
export const jestSetup = async (): Promise<void> => {
    const { ConfigService } = await import('../../config/configService');
    const configService = ConfigService.getInstance();
    const config = await configService.initialize();

    await setupTestDatabase(config);
};

export const jestTeardown = async (): Promise<void> => {
    await teardownTestDatabase();
};

// Cleanup function for individual tests
export async function cleanupTestData(): Promise<void> {
    if (globalTestSetup) {
        // Clear cache
        const Redis = (await import('ioredis')).default;
        const redis = new Redis({
            host: globalTestSetup.testConfig.cache.redis.host,
            port: globalTestSetup.testConfig.cache.redis.port,
            db: globalTestSetup.testConfig.cache.redis.db,
            lazyConnect: true
        });

        try {
            await redis.connect();
            await redis.flushdb();
        } catch (error) {
            logger.warn('Failed to clear test cache', { error });
        } finally {
            await redis.disconnect();
        }

        // Clear test data from metadata database
        const { Database } = await import('sqlite3');
        const { promisify } = await import('util');

        const connectionString = globalTestSetup.testConfig.database.metadata.connectionString;
        const dbPath = connectionString.replace('sqlite://', '');

        const db = new Database(dbPath);
        const run = promisify(db.run.bind(db));

        try {
            await run('DELETE FROM query_history');
            await run('DELETE FROM system_metrics');
            await run('DELETE FROM content_chunks');
            await run('DELETE FROM content');
            await run('DELETE FROM data_sources');
        } catch (error) {
            logger.warn('Failed to clear test database data', { error });
        } finally {
            const close = promisify(db.close.bind(db));
            await close();
        }
    }
}