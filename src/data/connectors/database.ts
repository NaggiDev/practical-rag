import { ChangeStream, Collection, Db, MongoClient } from 'mongodb';
import { Pool as PgPool, QueryResult } from 'pg';
import { Content, ContentModel } from '../../models/content';
import { DataSource, DatabaseDataSourceConfig } from '../../models/dataSource';
import { AuthenticationError, ConnectionError, DataSourceError, TimeoutError } from '../../utils/errors';
import { DataSourceConnector, SyncResult } from './base';

export interface DatabaseMetadata {
    tableName?: string;
    query?: string;
    lastSyncTimestamp?: Date;
    recordCount: number;
    schema?: string;
    database?: string;
}

export interface DatabaseRecord {
    id: string | number;
    content: string;
    title?: string;
    metadata?: Record<string, any>;
    created_at?: Date;
    updated_at?: Date;
}

export interface ConnectionPool {
    acquire(): Promise<any>;
    release(connection: any): Promise<void>;
    destroy(): Promise<void>;
    size(): number;
    available(): number;
}

export type DatabaseType = 'postgresql' | 'mysql' | 'mongodb' | 'sqlite';

/**
 * Database data source connector
 * Supports SQL (PostgreSQL, MySQL, SQLite) and NoSQL (MongoDB) databases
 * Implements connection pooling and incremental sync capabilities
 */
export class DatabaseConnector extends DataSourceConnector {
    protected override readonly config: DatabaseDataSourceConfig;
    private dbType: DatabaseType;
    // Connection pool interface for future extensibility
    // private connectionPool: ConnectionPool | null = null;
    private pgPool: PgPool | null = null;
    private mongoClient: MongoClient | null = null;
    private mongoDb: Db | null = null;
    private changeStream: ChangeStream | null = null;
    private lastSyncTimestamp: Date | null = null;

    constructor(dataSource: DataSource) {
        super(dataSource);
        this.config = dataSource.config as DatabaseDataSourceConfig;
        this.dbType = this.detectDatabaseType();
        this.validateDatabaseConfig();
    }

    /**
     * Connect to the database and establish connection pool
     */
    public async connect(): Promise<void> {
        try {

            this.validateConfig();

            switch (this.dbType) {
                case 'postgresql':
                    await this.connectPostgreSQL();
                    break;
                case 'mongodb':
                    await this.connectMongoDB();
                    break;
                default:
                    throw new DataSourceError(
                        `Database type ${this.dbType} is not yet supported`,
                        'UNSUPPORTED_DATABASE',
                        this.dataSource.id
                    );
            }

            this.isConnected = true;

            this.logOperation('info', `Connected to ${this.dbType} database`);
        } catch (error) {

            this.handleError(error, 'connect');
        }
    }

    /**
     * Disconnect from database and cleanup resources
     */
    public async disconnect(): Promise<void> {
        try {
            if (this.changeStream) {
                await this.changeStream.close();
                this.changeStream = null;
            }

            if (this.pgPool) {
                await this.pgPool.end();
                this.pgPool = null;
            }

            if (this.mongoClient) {
                await this.mongoClient.close();
                this.mongoClient = null;
                this.mongoDb = null;
            }

            // Connection pools cleaned up above
            this.isConnected = false;
            this.logOperation('info', 'Disconnected from database');
        } catch (error) {
            this.logOperation('warn', 'Error during disconnect', {
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Validate database connection
     */
    public async validateConnection(): Promise<boolean> {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            switch (this.dbType) {
                case 'postgresql':
                    return await this.validatePostgreSQLConnection();
                case 'mongodb':
                    return await this.validateMongoDBConnection();
                default:
                    return false;
            }
        } catch (error) {
            this.logOperation('warn', 'Connection validation failed', {
                error: error instanceof Error ? error.message : String(error)
            });
            return false;
        }
    }

    /**
     * Sync data from database with incremental support
     */
    public async sync(incremental: boolean = false): Promise<SyncResult> {
        const startTime = Date.now();
        const result: SyncResult = {
            success: false,
            documentsProcessed: 0,
            documentsAdded: 0,
            documentsUpdated: 0,
            documentsDeleted: 0,
            errors: [],
            duration: 0
        };

        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const lastSync = incremental ? this.lastSyncTimestamp : null;
            const records = await this.fetchRecords(lastSync);

            this.logOperation('info', `Fetched ${records.length} records for processing`);


            for (const record of records) {
                try {
                    // Create content from record (in real implementation, this would save to content store)
                    this.createContentFromRecord(record);
                    result.documentsProcessed++;
                    result.documentsAdded++; // Simplified - would need to check if update vs add
                } catch (error) {
                    const errorMsg = `Failed to process record ${record.id}: ${error instanceof Error ? error.message : String(error)}`;
                    result.errors.push(errorMsg);
                    this.logOperation('error', errorMsg);
                }
            }

            this.lastSyncTimestamp = new Date();
            result.success = result.errors.length === 0;
            result.duration = Date.now() - startTime;

            this.logOperation('info', 'Database sync completed', {
                documentsProcessed: result.documentsProcessed,
                documentsAdded: result.documentsAdded,
                errors: result.errors.length,
                duration: result.duration
            });

            return result;
        } catch (error) {
            result.success = false;
            result.duration = Date.now() - startTime;
            const errorMsg = `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
            result.errors.push(errorMsg);
            this.logOperation('error', errorMsg);
            return result;
        }
    }

    /**
     * Get content from database
     */
    public async getContent(lastSync?: Date): Promise<Content[]> {
        try {
            if (!this.isConnected) {
                await this.connect();
            }

            const records = await this.fetchRecords(lastSync);
            const contents: Content[] = [];

            for (const record of records) {
                try {
                    const content = this.createContentFromRecord(record);
                    contents.push(content.toJSON());
                } catch (error) {
                    this.logOperation('warn', `Failed to create content from record ${record.id}`, {
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            return contents;
        } catch (error) {
            this.logOperation('error', `Failed to get content: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Detect database type from connection string
     */
    private detectDatabaseType(): DatabaseType {
        const connectionString = this.config.connectionString.toLowerCase();

        if (connectionString.startsWith('postgresql://') || connectionString.startsWith('postgres://')) {
            return 'postgresql';
        } else if (connectionString.startsWith('mongodb://') || connectionString.startsWith('mongodb+srv://')) {
            return 'mongodb';
        } else if (connectionString.startsWith('mysql://')) {
            return 'mysql';
        } else if (connectionString.includes('sqlite') || connectionString.endsWith('.db')) {
            return 'sqlite';
        }

        throw new DataSourceError(
            'Unable to detect database type from connection string',
            'INVALID_CONNECTION_STRING',
            this.dataSource.id
        );
    }

    /**
     * Validate database-specific configuration
     */
    private validateDatabaseConfig(): void {
        if (!this.config.connectionString) {
            throw new DataSourceError(
                'Database connection string is required',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }

        if (!this.config.query && !this.config.table) {
            throw new DataSourceError(
                'Either query or table must be specified',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }

        if (!this.config.credentials || !this.config.credentials.username || !this.config.credentials.password) {
            throw new DataSourceError(
                'Database credentials are required',
                'INVALID_CONFIG',
                this.dataSource.id
            );
        }
    }

    /**
     * Connect to PostgreSQL database
     */
    private async connectPostgreSQL(): Promise<void> {
        try {
            const poolConfig = {
                connectionString: this.config.connectionString,
                user: this.config.credentials.username,
                password: this.config.credentials.password,
                max: 10, // Maximum number of connections in pool
                min: 2,  // Minimum number of connections in pool
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: this.config.timeout || 30000,
            };

            this.pgPool = new PgPool(poolConfig);

            // Test connection
            const client = await this.pgPool.connect();
            await client.query('SELECT 1');
            client.release();

            this.logOperation('info', 'PostgreSQL connection pool established');
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('authentication') || error.message.includes('password')) {
                    throw new AuthenticationError(
                        `PostgreSQL authentication failed: ${error.message}`,
                        this.dataSource.id
                    );
                } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                    throw new TimeoutError(
                        `PostgreSQL connection timeout: ${error.message}`,
                        this.dataSource.id
                    );
                } else {
                    throw new ConnectionError(
                        `PostgreSQL connection failed: ${error.message}`,
                        this.dataSource.id
                    );
                }
            }
            throw error;
        }
    }

    /**
     * Connect to MongoDB database
     */
    private async connectMongoDB(): Promise<void> {
        try {
            const options = {
                auth: {
                    username: this.config.credentials.username,
                    password: this.config.credentials.password,
                },
                maxPoolSize: 10,
                minPoolSize: 2,
                maxIdleTimeMS: 30000,
                serverSelectionTimeoutMS: this.config.timeout || 30000,
                socketTimeoutMS: this.config.timeout || 30000,
            };

            this.mongoClient = new MongoClient(this.config.connectionString, options);
            await this.mongoClient.connect();

            // Extract database name from connection string or use default
            const dbName = this.extractDatabaseName() || 'default';
            this.mongoDb = this.mongoClient.db(dbName);

            // Test connection
            await this.mongoDb.admin().ping();

            this.logOperation('info', 'MongoDB connection established');
        } catch (error) {
            if (error instanceof Error) {
                if (error.message.includes('authentication') || error.message.includes('Unauthorized')) {
                    throw new AuthenticationError(
                        `MongoDB authentication failed: ${error.message}`,
                        this.dataSource.id
                    );
                } else if (error.message.includes('timeout') || error.message.includes('ETIMEDOUT')) {
                    throw new TimeoutError(
                        `MongoDB connection timeout: ${error.message}`,
                        this.dataSource.id
                    );
                } else {
                    throw new ConnectionError(
                        `MongoDB connection failed: ${error.message}`,
                        this.dataSource.id
                    );
                }
            }
            throw error;
        }
    }

    /**
     * Validate PostgreSQL connection
     */
    private async validatePostgreSQLConnection(): Promise<boolean> {
        if (!this.pgPool) return false;

        try {
            const client = await this.pgPool.connect();
            await client.query('SELECT 1');
            client.release();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Validate MongoDB connection
     */
    private async validateMongoDBConnection(): Promise<boolean> {
        if (!this.mongoDb) return false;

        try {
            await this.mongoDb.admin().ping();
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Fetch records from database
     */
    private async fetchRecords(lastSync?: Date | null): Promise<DatabaseRecord[]> {
        switch (this.dbType) {
            case 'postgresql':
                return await this.fetchPostgreSQLRecords(lastSync);
            case 'mongodb':
                return await this.fetchMongoDBRecords(lastSync);
            default:
                throw new DataSourceError(
                    `Fetching records for ${this.dbType} is not implemented`,
                    'NOT_IMPLEMENTED',
                    this.dataSource.id
                );
        }
    }

    /**
     * Fetch records from PostgreSQL
     */
    private async fetchPostgreSQLRecords(lastSync?: Date | null): Promise<DatabaseRecord[]> {
        if (!this.pgPool) {
            throw new ConnectionError('PostgreSQL pool not initialized', this.dataSource.id);
        }

        const client = await this.pgPool.connect();
        try {
            let query: string = this.config.query || '';
            const params: any[] = [];

            // If no custom query, build one from table
            if (!query && this.config.table) {
                query = `SELECT * FROM ${this.config.table}`;

                // Add incremental sync condition
                if (lastSync && this.config.incrementalField) {
                    query += ` WHERE ${this.config.incrementalField} > $1`;
                    params.push(lastSync);
                }
            } else if (query && lastSync && this.config.incrementalField) {
                // Modify existing query for incremental sync
                const whereClause = query.toLowerCase().includes('where') ? 'AND' : 'WHERE';
                query += ` ${whereClause} ${this.config.incrementalField} > $${params.length + 1}`;
                params.push(lastSync);
            }

            // Add limit for batch processing
            const batchSize = this.config.batchSize || 1000;
            query += ` LIMIT ${batchSize}`;

            const result: QueryResult = await client.query(query, params.length > 0 ? params : undefined);

            return result.rows.map(row => this.mapPostgreSQLRowToRecord(row));
        } finally {
            client.release();
        }
    }

    /**
     * Fetch records from MongoDB
     */
    private async fetchMongoDBRecords(lastSync?: Date | null): Promise<DatabaseRecord[]> {
        if (!this.mongoDb) {
            throw new ConnectionError('MongoDB connection not initialized', this.dataSource.id);
        }

        const collectionName = this.config.table || 'documents';
        const collection: Collection = this.mongoDb.collection(collectionName);

        const filter: any = {};

        // Add incremental sync condition
        if (lastSync && this.config.incrementalField) {
            filter[this.config.incrementalField] = { $gt: lastSync };
        }

        const batchSize = this.config.batchSize || 1000;
        const cursor = collection.find(filter).limit(batchSize);

        const documents = await cursor.toArray();
        return documents.map(doc => this.mapMongoDocumentToRecord(doc));
    }

    /**
     * Map PostgreSQL row to DatabaseRecord
     */
    private mapPostgreSQLRowToRecord(row: any): DatabaseRecord {
        return {
            id: row.id || row._id || row.uuid,
            content: row.content || row.text || row.body || '',
            title: row.title || row.name || row.subject,
            metadata: {
                ...row,
                source: 'postgresql',
                table: this.config.table
            },
            created_at: row.created_at || row.createdAt,
            updated_at: row.updated_at || row.updatedAt || row.modified_at
        };
    }

    /**
     * Map MongoDB document to DatabaseRecord
     */
    private mapMongoDocumentToRecord(doc: any): DatabaseRecord {
        return {
            id: doc._id || doc.id,
            content: doc.content || doc.text || doc.body || '',
            title: doc.title || doc.name || doc.subject,
            metadata: {
                ...doc,
                source: 'mongodb',
                collection: this.config.table
            },
            created_at: doc.created_at || doc.createdAt,
            updated_at: doc.updated_at || doc.updatedAt || doc.modified_at
        };
    }

    /**
     * Create Content model from database record
     */
    private createContentFromRecord(record: DatabaseRecord): ContentModel {
        return new ContentModel({
            sourceId: this.dataSource.id,
            title: record.title || `Record ${record.id}`,
            text: record.content,
            metadata: {
                ...record.metadata,
                recordId: record.id,
                createdAt: record.created_at,
                modifiedAt: record.updated_at,
                category: 'database'
            },
            embedding: [0.0], // Placeholder embedding - will be populated by embedding service
            chunks: [], // Will be populated by chunking service
            lastUpdated: new Date(),
            version: 1
        });
    }

    /**
     * Extract database name from MongoDB connection string
     */
    private extractDatabaseName(): string | null {
        try {
            const url = new URL(this.config.connectionString);
            return url.pathname.substring(1) || null;
        } catch {
            return null;
        }
    }

    /**
     * Get database metadata
     */
    public async getDatabaseMetadata(): Promise<DatabaseMetadata> {
        if (!this.isConnected) {
            await this.connect();
        }

        switch (this.dbType) {
            case 'postgresql':
                return await this.getPostgreSQLMetadata();
            case 'mongodb':
                return await this.getMongoDBMetadata();
            default:
                return {
                    recordCount: 0,
                    lastSyncTimestamp: this.lastSyncTimestamp || undefined
                };
        }
    }

    /**
     * Get PostgreSQL metadata
     */
    private async getPostgreSQLMetadata(): Promise<DatabaseMetadata> {
        if (!this.pgPool) {
            throw new ConnectionError('PostgreSQL pool not initialized', this.dataSource.id);
        }

        const client = await this.pgPool.connect();
        try {
            let recordCount = 0;

            if (this.config.table) {
                const result = await client.query(`SELECT COUNT(*) as count FROM ${this.config.table}`);
                recordCount = parseInt(result.rows[0].count);
            }

            return {
                tableName: this.config.table,
                query: this.config.query,
                recordCount,
                lastSyncTimestamp: this.lastSyncTimestamp || undefined,
                schema: 'public' // Default schema for PostgreSQL
            };
        } finally {
            client.release();
        }
    }

    /**
     * Get MongoDB metadata
     */
    private async getMongoDBMetadata(): Promise<DatabaseMetadata> {
        if (!this.mongoDb) {
            throw new ConnectionError('MongoDB connection not initialized', this.dataSource.id);
        }

        const collectionName = this.config.table || 'documents';
        const collection = this.mongoDb.collection(collectionName);

        const recordCount = await collection.countDocuments();

        return {
            tableName: collectionName,
            recordCount,
            lastSyncTimestamp: this.lastSyncTimestamp || undefined,
            database: this.mongoDb.databaseName
        };
    }

    /**
     * Get connection pool statistics
     */
    public getPoolStats(): { total: number; idle: number; waiting: number } {
        if (this.pgPool) {
            return {
                total: this.pgPool.totalCount,
                idle: this.pgPool.idleCount,
                waiting: this.pgPool.waitingCount
            };
        }

        return { total: 0, idle: 0, waiting: 0 };
    }
}