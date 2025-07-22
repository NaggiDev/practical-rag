"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initialSchemaMigration = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const sqlite3_1 = require("sqlite3");
const util_1 = require("util");
exports.initialSchemaMigration = {
    id: '001',
    name: 'Initial Schema',
    async up(config) {
        const connectionString = config.database.metadata.connectionString;
        const dbPath = connectionString.replace('sqlite://', '');
        const dir = path_1.default.dirname(dbPath);
        await promises_1.default.mkdir(dir, { recursive: true });
        const db = new sqlite3_1.Database(dbPath);
        const run = (0, util_1.promisify)(db.run.bind(db));
        try {
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
            await run(`
                CREATE TABLE IF NOT EXISTS system_metrics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    metric_name TEXT NOT NULL,
                    metric_value REAL NOT NULL,
                    metadata TEXT,
                    recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
            await run('CREATE INDEX IF NOT EXISTS idx_data_sources_type ON data_sources (type)');
            await run('CREATE INDEX IF NOT EXISTS idx_data_sources_status ON data_sources (status)');
            await run('CREATE INDEX IF NOT EXISTS idx_content_source_id ON content (source_id)');
            await run('CREATE INDEX IF NOT EXISTS idx_content_chunks_content_id ON content_chunks (content_id)');
            await run('CREATE INDEX IF NOT EXISTS idx_content_chunks_position ON content_chunks (position)');
            await run('CREATE INDEX IF NOT EXISTS idx_query_history_hash ON query_history (query_hash)');
            await run('CREATE INDEX IF NOT EXISTS idx_query_history_created_at ON query_history (created_at)');
            await run('CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics (metric_name)');
            await run('CREATE INDEX IF NOT EXISTS idx_system_metrics_recorded_at ON system_metrics (recorded_at)');
        }
        finally {
            const close = (0, util_1.promisify)(db.close.bind(db));
            await close();
        }
    },
    async down(config) {
        const connectionString = config.database.metadata.connectionString;
        const dbPath = connectionString.replace('sqlite://', '');
        const db = new sqlite3_1.Database(dbPath);
        const run = (0, util_1.promisify)(db.run.bind(db));
        try {
            await run('DROP TABLE IF EXISTS system_metrics');
            await run('DROP TABLE IF EXISTS query_history');
            await run('DROP TABLE IF EXISTS content_chunks');
            await run('DROP TABLE IF EXISTS content');
            await run('DROP TABLE IF EXISTS data_sources');
        }
        finally {
            const close = (0, util_1.promisify)(db.close.bind(db));
            await close();
        }
    }
};
//# sourceMappingURL=001_initial_schema.js.map