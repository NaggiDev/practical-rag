"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseSetup = void 0;
exports.runSetup = runSetup;
exports.runTeardown = runTeardown;
const configService_1 = require("../../config/configService");
const logger_1 = require("../../utils/logger");
const _001_initial_schema_1 = require("./001_initial_schema");
const _002_vector_database_init_1 = require("./002_vector_database_init");
const _003_redis_cache_setup_1 = require("./003_redis_cache_setup");
const migrationRunner_1 = require("./migrationRunner");
class DatabaseSetup {
    constructor(config) {
        this.config = config;
        this.migrationRunner = new migrationRunner_1.MigrationRunner(config);
    }
    async setupDatabase() {
        logger_1.logger.info('Starting database setup');
        const migrations = [
            _001_initial_schema_1.initialSchemaMigration,
            _002_vector_database_init_1.vectorDatabaseInitMigration,
            _003_redis_cache_setup_1.redisCacheSetupMigration
        ];
        try {
            await this.migrationRunner.runMigrations(migrations);
            logger_1.logger.info('Database setup completed successfully');
        }
        catch (error) {
            logger_1.logger.error('Database setup failed', { error });
            throw error;
        }
    }
    async teardownDatabase() {
        logger_1.logger.info('Starting database teardown');
        const migrations = [
            _003_redis_cache_setup_1.redisCacheSetupMigration,
            _002_vector_database_init_1.vectorDatabaseInitMigration,
            _001_initial_schema_1.initialSchemaMigration
        ];
        try {
            for (const migration of migrations.reverse()) {
                await this.migrationRunner.rollbackMigration(migration);
            }
            logger_1.logger.info('Database teardown completed successfully');
        }
        catch (error) {
            logger_1.logger.error('Database teardown failed', { error });
            throw error;
        }
        finally {
            await this.migrationRunner.close();
        }
    }
    async close() {
        await this.migrationRunner.close();
    }
}
exports.DatabaseSetup = DatabaseSetup;
async function runSetup() {
    try {
        const configService = configService_1.ConfigService.getInstance();
        const config = await configService.initialize();
        const setup = new DatabaseSetup(config);
        await setup.setupDatabase();
        await setup.close();
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Setup failed', { error });
        process.exit(1);
    }
}
async function runTeardown() {
    try {
        const configService = configService_1.ConfigService.getInstance();
        const config = await configService.initialize();
        const setup = new DatabaseSetup(config);
        await setup.teardownDatabase();
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Teardown failed', { error });
        process.exit(1);
    }
}
if (require.main === module) {
    const command = process.argv[2];
    switch (command) {
        case 'setup':
            runSetup();
            break;
        case 'teardown':
            runTeardown();
            break;
        default:
            console.log('Usage: ts-node setup.ts [setup|teardown]');
            process.exit(1);
    }
}
//# sourceMappingURL=setup.js.map