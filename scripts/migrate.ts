#!/usr/bin/env ts-node

import { program } from 'commander';
import { ConfigService } from '../src/config/configService';
import { DatabaseSetup } from '../src/data/migrations/setup';
import { logger } from '../src/utils/logger';

program
    .name('migrate')
    .description('Database migration tool for Fast RAG System')
    .version('1.0.0');

program
    .command('up')
    .description('Run all pending migrations')
    .action(async () => {
        try {
            logger.info('Running database migrations...');

            const configService = ConfigService.getInstance();
            const config = await configService.loadConfig();

            const setup = new DatabaseSetup(config);
            await setup.setupDatabase();
            await setup.close();

            logger.info('Migrations completed successfully');
            process.exit(0);
        } catch (error) {
            logger.error('Migration failed', error);
            process.exit(1);
        }
    });

program
    .command('down')
    .description('Rollback all migrations')
    .action(async () => {
        try {
            logger.info('Rolling back database migrations...');

            const configService = ConfigService.getInstance();
            const config = await configService.loadConfig();

            const setup = new DatabaseSetup(config);
            await setup.teardownDatabase();

            logger.info('Rollback completed successfully');
            process.exit(0);
        } catch (error) {
            logger.error('Rollback failed', error);
            process.exit(1);
        }
    });

program
    .command('reset')
    .description('Rollback and then run all migrations')
    .action(async () => {
        try {
            logger.info('Resetting database...');

            const configService = ConfigService.getInstance();
            const config = await configService.loadConfig();

            const setup = new DatabaseSetup(config);

            // First rollback
            await setup.teardownDatabase();

            // Then setup again
            await setup.setupDatabase();
            await setup.close();

            logger.info('Database reset completed successfully');
            process.exit(0);
        } catch (error) {
            logger.error('Database reset failed', error);
            process.exit(1);
        }
    });

program.parse();