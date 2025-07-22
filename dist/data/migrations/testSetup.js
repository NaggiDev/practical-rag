"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jestTeardown = exports.jestSetup = exports.TestDatabaseSetup = void 0;
exports.setupTestDatabase = setupTestDatabase;
exports.teardownTestDatabase = teardownTestDatabase;
exports.cleanupTestData = cleanupTestData;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const uuid_1 = require("uuid");
const logger_1 = require("../../utils/logger");
const setup_1 = require("./setup");
class TestDatabaseSetup extends setup_1.DatabaseSetup {
    constructor(config) {
        const testConfig = TestDatabaseSetup.createTestConfig(config);
        super(testConfig);
        this.testId = (0, uuid_1.v4)().substring(0, 8);
        this.testConfig = testConfig;
    }
    static createTestConfig(baseConfig) {
        const testId = (0, uuid_1.v4)().substring(0, 8);
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
                    db: 15
                }
            }
        };
    }
    async setupTestDatabase() {
        logger_1.logger.info(`Setting up test database (ID: ${this.testId})`);
        const testDataDir = path_1.default.join(process.cwd(), 'data', 'test');
        await promises_1.default.mkdir(testDataDir, { recursive: true });
        await this.setupDatabase();
        logger_1.logger.info(`Test database setup completed (ID: ${this.testId})`);
    }
    async teardownTestDatabase() {
        logger_1.logger.info(`Tearing down test database (ID: ${this.testId})`);
        try {
            await this.teardownDatabase();
            await this.cleanupTestFiles();
            logger_1.logger.info(`Test database teardown completed (ID: ${this.testId})`);
        }
        catch (error) {
            logger_1.logger.error(`Test database teardown failed (ID: ${this.testId})`, { error });
            throw error;
        }
    }
    async cleanupTestFiles() {
        try {
            const testDataDir = path_1.default.join(process.cwd(), 'data', 'test');
            const files = await promises_1.default.readdir(testDataDir);
            for (const file of files) {
                if (file.includes(this.testId)) {
                    await promises_1.default.unlink(path_1.default.join(testDataDir, file));
                }
            }
            const testVectorDir = path_1.default.join(process.cwd(), 'data', 'test-vector-index');
            await promises_1.default.rm(testVectorDir, { recursive: true, force: true });
        }
        catch (error) {
            logger_1.logger.warn('Failed to cleanup some test files', { error });
        }
    }
    getTestId() {
        return this.testId;
    }
}
exports.TestDatabaseSetup = TestDatabaseSetup;
let globalTestSetup = null;
async function setupTestDatabase(config) {
    if (globalTestSetup) {
        await globalTestSetup.teardownTestDatabase();
    }
    globalTestSetup = new TestDatabaseSetup(config);
    await globalTestSetup.setupTestDatabase();
    return globalTestSetup;
}
async function teardownTestDatabase() {
    if (globalTestSetup) {
        await globalTestSetup.teardownTestDatabase();
        globalTestSetup = null;
    }
}
const jestSetup = async () => {
    const { ConfigService } = await Promise.resolve().then(() => __importStar(require('../../config/configService')));
    const configService = ConfigService.getInstance();
    const config = await configService.initialize();
    await setupTestDatabase(config);
};
exports.jestSetup = jestSetup;
const jestTeardown = async () => {
    await teardownTestDatabase();
};
exports.jestTeardown = jestTeardown;
async function cleanupTestData() {
    if (globalTestSetup) {
        const Redis = (await Promise.resolve().then(() => __importStar(require('ioredis')))).default;
        const redis = new Redis({
            host: globalTestSetup.testConfig.cache.redis.host,
            port: globalTestSetup.testConfig.cache.redis.port,
            db: globalTestSetup.testConfig.cache.redis.db,
            lazyConnect: true
        });
        try {
            await redis.connect();
            await redis.flushdb();
        }
        catch (error) {
            logger_1.logger.warn('Failed to clear test cache', { error });
        }
        finally {
            await redis.disconnect();
        }
        const { Database } = await Promise.resolve().then(() => __importStar(require('sqlite3')));
        const { promisify } = await Promise.resolve().then(() => __importStar(require('util')));
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
        }
        catch (error) {
            logger_1.logger.warn('Failed to clear test database data', { error });
        }
        finally {
            const close = promisify(db.close.bind(db));
            await close();
        }
    }
}
//# sourceMappingURL=testSetup.js.map