import { ConfigService } from '../../config/configService';
import { SystemConfig } from '../../models/config';
import { logger } from '../../utils/logger';
import { initialSchemaMigration } from './001_initial_schema';
import { vectorDatabaseInitMigration } from './002_vector_database_init';
import { redisCacheSetupMigration } from './003_redis_cache_setup';
import { MigrationRunner } from './migrationRunner';

export class DatabaseSetup {
    private migrationRunner: MigrationRunner;
    protected config: SystemConfig;

    constructor(config: SystemConfig) {
        this.config = config;
        this.migrationRunner = new MigrationRunner(config);
    }

    async setupDatabase(): Promise<void> {
        logger.info('Starting database setup');

        const migrations = [
            initialSchemaMigration,
            vectorDatabaseInitMigration,
            redisCacheSetupMigration
        ];

        try {
            await this.migrationRunner.runMigrations(migrations);
            logger.info('Database setup completed successfully');
        } catch (error) {
            logger.error('Database setup failed', { error });
            throw error;
        }
    }

    async teardownDatabase(): Promise<void> {
        logger.info('Starting database teardown');

        const migrations = [
            redisCacheSetupMigration,
            vectorDatabaseInitMigration,
            initialSchemaMigration
        ];

        try {
            // Run migrations in reverse order
            for (const migration of migrations.reverse()) {
                await this.migrationRunner.rollbackMigration(migration);
            }
            logger.info('Database teardown completed successfully');
        } catch (error) {
            logger.error('Database teardown failed', { error });
            throw error;
        } finally {
            await this.migrationRunner.close();
        }
    }

    async close(): Promise<void> {
        await this.migrationRunner.close();
    }
}

// CLI interface for setup/teardown
export async function runSetup(): Promise<void> {
    try {
        const configService = ConfigService.getInstance();
        const config = await configService.initialize();

        const setup = new DatabaseSetup(config);
        await setup.setupDatabase();
        await setup.close();

        process.exit(0);
    } catch (error) {
        logger.error('Setup failed', { error });
        process.exit(1);
    }
}

export async function runTeardown(): Promise<void> {
    try {
        const configService = ConfigService.getInstance();
        const config = await configService.initialize();

        const setup = new DatabaseSetup(config);
        await setup.teardownDatabase();

        process.exit(0);
    } catch (error) {
        logger.error('Teardown failed', { error });
        process.exit(1);
    }
}

// Run setup if called directly
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