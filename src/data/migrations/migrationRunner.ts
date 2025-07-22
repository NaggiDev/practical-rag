import fs from 'fs/promises';
import path from 'path';
import { Database } from 'sqlite3';
import { promisify } from 'util';
import { SystemConfig } from '../../models/config';
import { logger } from '../../utils/logger';

export interface Migration {
    id: string;
    name: string;
    up: (config: SystemConfig) => Promise<void>;
    down: (config: SystemConfig) => Promise<void>;
}

export class MigrationRunner {
    private config: SystemConfig;
    private db: Database | null = null;

    constructor(config: SystemConfig) {
        this.config = config;
    }

    private async getMetadataDb(): Promise<Database> {
        if (!this.db) {
            const connectionString = this.config.database.metadata.connectionString;
            const dbPath = connectionString.replace('sqlite://', '');

            // Ensure directory exists
            const dir = path.dirname(dbPath);
            await fs.mkdir(dir, { recursive: true });

            this.db = new Database(dbPath);
        }
        return this.db;
    }

    private async initializeMigrationTable(): Promise<void> {
        const db = await this.getMetadataDb();
        const run = promisify(db.run.bind(db));

        await run(`
            CREATE TABLE IF NOT EXISTS migrations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    private async getExecutedMigrations(): Promise<string[]> {
        const db = await this.getMetadataDb();
        const all = promisify(db.all.bind(db));

        const rows = await all('SELECT id FROM migrations ORDER BY executed_at') as any[];
        return rows.map((row: any) => row.id);
    }

    private async recordMigration(migrationId: string, name: string): Promise<void> {
        const db = await this.getMetadataDb();

        return new Promise((resolve, reject) => {
            db.run(
                'INSERT INTO migrations (id, name) VALUES (?, ?)',
                [migrationId, name],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    private async removeMigrationRecord(migrationId: string): Promise<void> {
        const db = await this.getMetadataDb();

        return new Promise((resolve, reject) => {
            db.run(
                'DELETE FROM migrations WHERE id = ?',
                [migrationId],
                function (err) {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }

    async runMigrations(migrations: Migration[]): Promise<void> {
        logger.info('Starting database migrations');

        await this.initializeMigrationTable();
        const executedMigrations = await this.getExecutedMigrations();

        for (const migration of migrations) {
            if (!executedMigrations.includes(migration.id)) {
                logger.info(`Running migration: ${migration.name}`);

                try {
                    await migration.up(this.config);
                    await this.recordMigration(migration.id, migration.name);
                    logger.info(`Migration completed: ${migration.name}`);
                } catch (error) {
                    logger.error(`Migration failed: ${migration.name}`, {
                        error: error instanceof Error ? error.message : String(error),
                        migrationId: migration.id
                    });
                    throw error;
                }
            } else {
                logger.debug(`Migration already executed: ${migration.name}`);
            }
        }

        logger.info('All migrations completed successfully');
    }

    async rollbackMigration(migration: Migration): Promise<void> {
        logger.info(`Rolling back migration: ${migration.name}`);

        try {
            await migration.down(this.config);
            await this.removeMigrationRecord(migration.id);
            logger.info(`Migration rollback completed: ${migration.name}`);
        } catch (error) {
            logger.error(`Migration rollback failed: ${migration.name}`, {
                error: error instanceof Error ? error.message : String(error),
                migrationId: migration.id
            });
            throw error;
        }
    }

    async close(): Promise<void> {
        if (this.db) {
            const close = promisify(this.db.close.bind(this.db));
            await close();
            this.db = null;
        }
    }
}