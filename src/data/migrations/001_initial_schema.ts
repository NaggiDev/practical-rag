import fs from 'fs/promises';
import path from 'path';
import { Database } from 'sqlite3';
import { promisify } from 'util';
import { SystemConfig } from '../../models/config';
import { Migration } from './migrationRunner';

export const initialSchemaMigration: Migration = {
    id: '001',
    name: 'Initial Schema',

    async up(config: SystemConfig): Promise<void> {
        const connectionString = config.database.metadata.connectionString;
        const dbPath = connectionString.replace('sqlite://', '');

        // Ensure directory exists
        const dir = path.dirname(dbPath);
        await fs.mkdir(dir, { recursive: true });

        const db = new Database(dbPath);
        const run = promisify(db.run.bind(db));

        try {
            // Data sources table
            await run(`
                CREATE TABLE IF NOT EXISTS data_sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL CHECK (type IN ('file', 'database', 'api')),
                    config TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
                    last_sync DATETIME,
                    document_count INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Content table
            await run(`
                CREATE TABLE IF NOT EXISTS content (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    text TEXT NOT NULL,
                    metadata TEXT,
                    embedding_hash TEXT,
                    chunk_count INTEGER DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE CASCADE
                )
            `);

            // Content chunks table
            await run(`
                CREATE TABLE IF NOT EXISTS content_chunks (
                    id TEXT PRIMARY KEY,
                    content_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    embedding_hash TEXT,
                    position INTEGER NOT NULL,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (content_id) REFERENCES content (id) ON DELETE CASCADE
                )
            `);

            // Query history table
            await run(`
                CREATE TABLE IF NOT EXISTS query_history (
                    id TEXT PRIMARY KEY,
                    query_text TEXT NOT NULL,
                    query_hash TEXT NOT NULL,
                    user_id TEXT,
                    response_time_ms INTEGER,
                    result_count INTEGER,
                    cached BOOLEAN DEFAULT FALSE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // System metrics table
            await run(`
                CREATE TABLE IF NOT EXISTS system_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_name TEXT NOT NULL,
                    metric_value REAL NOT NULL,
                    metadata TEXT,
                    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);

            // Create indexes for better performance
            await run('CREATE INDEX IF NOT EXISTS idx_data_sources_type ON data_sources (type)');
            await run('CREATE INDEX IF NOT EXISTS idx_data_sources_status ON data_sources (status)');
            await run('CREATE INDEX IF NOT EXISTS idx_content_source_id ON content (source_id)');
            await run('CREATE INDEX IF NOT EXISTS idx_content_chunks_content_id ON content_chunks (content_id)');
            await run('CREATE INDEX IF NOT EXISTS idx_content_chunks_position ON content_chunks (position)');
            await run('CREATE INDEX IF NOT EXISTS idx_query_history_hash ON query_history (query_hash)');
            await run('CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history (created_at)');
            await run('CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics (metric_name)');
            await run('CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics (recorded_at)');

        } finally {
            const close = promisify(db.close.bind(db));
            await close();
        }
    },

    async down(config: SystemConfig): Promise<void> {
        const connectionString = config.database.metadata.connectionString;
        const dbPath = connectionString.replace('sqlite://', '');

        const db = new Database(dbPath);
        const run = promisify(db.run.bind(db));

        try {
            // Drop tables in reverse order due to foreign key constraints
            await run('DROP TABLE IF EXISTS system_metrics');
            await run('DROP TABLE IF EXISTS query_history');
            await run('DROP TABLE IF EXISTS content_chunks');
            await run('DROP TABLE IF EXISTS content');
            await run('DROP TABLE IF EXISTS data_sources');
        } finally {
            const close = promisify(db.close.bind(db));
            await close();
        }
    }
};