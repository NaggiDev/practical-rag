"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MigrationRunner = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sqlite3_1 = require("sqlite3");
const util_1 = require("util");
const logger_1 = require("../../utils/logger");
class MigrationRunner {
    constructor(config) {
        this.db = null;
        this.config = config;
    }
    async getMetadataDb() {
        if (!this.db) {
            const connectionString = this.config.database.metadata.connectionString;
            const dbPath = connectionString.replace('sqlite://', '');
            const dir = path_1.default.dirname(dbPath);
            await promises_1.default.mkdir(dir, { recursive: true });
            this.db = new sqlite3_1.Database(dbPath);
        }
        return this.db;
    }
    async initializeMigrationTable() {
        const db = await this.getMetadataDb();
        const run = (0, util_1.promisify)(db.run.bind(db));
        await run(`
            CREATE TABLE IF NOT EXISTS migrations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    async getExecutedMigrations() {
        const db = await this.getMetadataDb();
        const all = (0, util_1.promisify)(db.all.bind(db));
        const rows = await all('SELECT id FROM migrations ORDER BY executed_at');
        return rows.map((row) => row.id);
    }
    async recordMigration(migrationId, name) {
        const db = await this.getMetadataDb();
        return new Promise((resolve, reject) => {
            db.run('INSERT INTO migrations (id, name) VALUES (?, ?)', [migrationId, name], function (err) {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async removeMigrationRecord(migrationId) {
        const db = await this.getMetadataDb();
        return new Promise((resolve, reject) => {
            db.run('DELETE FROM migrations WHERE id = ?', [migrationId], function (err) {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    async runMigrations(migrations) {
        logger_1.logger.info('Starting database migrations');
        await this.initializeMigrationTable();
        const executedMigrations = await this.getExecutedMigrations();
        for (const migration of migrations) {
            if (!executedMigrations.includes(migration.id)) {
                logger_1.logger.info(`Running migration: ${migration.name}`);
                try {
                    await migration.up(this.config);
                    await this.recordMigration(migration.id, migration.name);
                    logger_1.logger.info(`Migration completed: ${migration.name}`);
                }
                catch (error) {
                    logger_1.logger.error(`Migration failed: ${migration.name}`, {
                        error: error instanceof Error ? error.message : String(error),
                        migrationId: migration.id
                    });
                    throw error;
                }
            }
            else {
                logger_1.logger.debug(`Migration already executed: ${migration.name}`);
            }
        }
        logger_1.logger.info('All migrations completed successfully');
    }
    async rollbackMigration(migration) {
        logger_1.logger.info(`Rolling back migration: ${migration.name}`);
        try {
            await migration.down(this.config);
            await this.removeMigrationRecord(migration.id);
            logger_1.logger.info(`Migration rollback completed: ${migration.name}`);
        }
        catch (error) {
            logger_1.logger.error(`Migration rollback failed: ${migration.name}`, {
                error: error instanceof Error ? error.message : String(error),
                migrationId: migration.id
            });
            throw error;
        }
    }
    async close() {
        if (this.db) {
            const close = (0, util_1.promisify)(this.db.close.bind(this.db));
            await close();
            this.db = null;
        }
    }
}
exports.MigrationRunner = MigrationRunner;
//# sourceMappingURL=migrationRunner.js.map