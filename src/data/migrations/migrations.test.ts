import Redis from 'ioredis';
import { Database } from 'sqlite3';
import { promisify } from 'util';
import { ConfigService } from '../../config/configService';
import { TestDatabaseSetup, cleanupTestData } from './testSetup';

describe('Database Migrations', () => {
    let testSetup: TestDatabaseSetup;
    let config: any;

    beforeAll(async () => {
        const configService = ConfigService.getInstance();
        config = await configService.initialize();
        testSetup = new TestDatabaseSetup(config);
    });

    afterAll(async () => {
        if (testSetup) {
            await testSetup.close();
        }
    });

    beforeEach(async () => {
        await cleanupTestData();
    });

    describe('Migration Runner', () => {
        it('should run initial schema migration successfully', async () => {
            // The migration should already be run by the test setup
            // Let's verify the tables exist
            const connectionString = testSetup.testConfig.database.metadata.connectionString;
            const dbPath = connectionString.replace('sqlite://', '');

            const db = new Database(dbPath);
            const all = promisify(db.all.bind(db));

            try {
                // Check if tables exist
                const tables = await all(`
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                `);

                const tableNames = tables.map((row: any) => row.name);

                expect(tableNames).toContain('migrations');
                expect(tableNames).toContain('data_sources');
                expect(tableNames).toContain('content');
                expect(tableNames).toContain('content_chunks');
                expect(tableNames).toContain('query_history');
                expect(tableNames).toContain('system_metrics');

            } finally {
                const close = promisify(db.close.bind(db));
                await close();
            }
        });

        it('should create proper indexes', async () => {
            const connectionString = testSetup.testConfig.database.metadata.connectionString;
            const dbPath = connectionString.replace('sqlite://', '');

            const db = new Database(dbPath);
            const all = promisify(db.all.bind(db));

            try {
                const indexes = await all(`
                    SELECT name FROM sqlite_master 
                    WHERE type='index' AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                `);

                const indexNames = indexes.map((row: any) => row.name);

                expect(indexNames).toContain('idx_data_sources_type');
                expect(indexNames).toContain('idx_content_source_id');
                expect(indexNames).toContain('idx_query_history_hash');

            } finally {
                const close = promisify(db.close.bind(db));
                await close();
            }
        });
    });

    describe('Redis Cache Setup', () => {
        it('should connect to Redis and setup namespaces', async () => {
            const redis = new Redis({
                host: testSetup.testConfig.cache.redis.host,
                port: testSetup.testConfig.cache.redis.port,
                db: testSetup.testConfig.cache.redis.db,
                lazyConnect: true
            });

            try {
                await redis.connect();

                // Check if namespaces are set up
                const namespaces = await redis.hgetall('rag:namespaces');
                expect(namespaces).toHaveProperty('rag:queries');
                expect(namespaces).toHaveProperty('rag:embeddings');
                expect(namespaces).toHaveProperty('rag:content');

                // Check if default TTLs are set up
                const ttls = await redis.hgetall('rag:ttl:defaults');
                expect(ttls).toHaveProperty('rag:queries');
                expect(ttls).toHaveProperty('rag:embeddings');

            } finally {
                await redis.disconnect();
            }
        });

        it('should handle cache operations', async () => {
            const redis = new Redis({
                host: testSetup.testConfig.cache.redis.host,
                port: testSetup.testConfig.cache.redis.port,
                db: testSetup.testConfig.cache.redis.db,
                lazyConnect: true
            });

            try {
                await redis.connect();

                // Test basic cache operations
                await redis.set('rag:test:key', 'test-value', 'EX', 60);
                const value = await redis.get('rag:test:key');
                expect(value).toBe('test-value');

                // Test TTL
                const ttl = await redis.ttl('rag:test:key');
                expect(ttl).toBeGreaterThan(0);
                expect(ttl).toBeLessThanOrEqual(60);

            } finally {
                await redis.disconnect();
            }
        });
    });

    describe('Test Database Setup', () => {
        it('should create isolated test environment', async () => {
            const testId = testSetup.getTestId();
            expect(testId).toBeDefined();
            expect(testId).toHaveLength(8);

            // Verify test database is isolated
            expect(testSetup.testConfig.database.metadata.connectionString).toContain('test');
            expect(testSetup.testConfig.database.vector.indexName).toContain('test');
            expect(testSetup.testConfig.cache.redis.db).toBe(15);
        });

        it('should cleanup test data properly', async () => {
            const connectionString = testSetup.testConfig.database.metadata.connectionString;
            const dbPath = connectionString.replace('sqlite://', '');

            const db = new Database(dbPath);
            const run = promisify(db.run.bind(db));
            const get = promisify(db.get.bind(db));

            try {
                // Insert test data
                await run('INSERT INTO data_sources (id, name, type, config) VALUES (?, ?, ?, ?)',
                    ['test-1', 'Test Source', 'file', '{}']);

                // Verify data exists
                let count = await get('SELECT COUNT(*) as count FROM data_sources');
                expect(count.count).toBe(1);

                // Cleanup
                await cleanupTestData();

                // Verify data is cleaned
                count = await get('SELECT COUNT(*) as count FROM data_sources');
                expect(count.count).toBe(0);

            } finally {
                const close = promisify(db.close.bind(db));
                await close();
            }
        });
    });
});