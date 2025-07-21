import { DataSource, DataSourceHealth, DataSourceModel } from '../models/dataSource';

export interface PaginationOptions {
    page: number;
    limit: number;
    sort?: 'asc' | 'desc';
    sortBy?: string;
}

export interface PaginationResult<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

export interface SyncResult {
    syncId: string;
    estimatedDuration: number;
    status: 'started' | 'queued' | 'failed';
}

// Basic interface for QueryProcessor dependency
export interface DataSourceManager {
    getActiveSources(): Promise<DataSource[]>;
    getAllSources(options: PaginationOptions): Promise<PaginationResult<DataSource>>;
    getSourceById(id: string): Promise<DataSource | null>;
    createSource(source: DataSourceModel): Promise<DataSource>;
    updateSource(id: string, source: DataSourceModel): Promise<DataSource>;
    deleteSource(id: string): Promise<boolean>;
    triggerSync(id: string): Promise<SyncResult>;
    checkHealth(id: string): Promise<DataSourceHealth>;
    validateSourceConnection(source: DataSourceModel): Promise<boolean>;
}

// In-memory storage for demo purposes - in production this would use a database
class InMemoryDataSourceStorage {
    private sources: Map<string, DataSource> = new Map();
    private healthStatus: Map<string, DataSourceHealth> = new Map();

    async save(source: DataSource): Promise<DataSource> {
        this.sources.set(source.id, { ...source });
        return { ...source };
    }

    async findById(id: string): Promise<DataSource | null> {
        const source = this.sources.get(id);
        return source ? { ...source } : null;
    }

    async findAll(options: PaginationOptions): Promise<PaginationResult<DataSource>> {
        const allSources = Array.from(this.sources.values());

        // Apply sorting
        if (options.sortBy) {
            allSources.sort((a, b) => {
                const aValue = (a as any)[options.sortBy!];
                const bValue = (b as any)[options.sortBy!];

                if (options.sort === 'asc') {
                    return aValue > bValue ? 1 : -1;
                } else {
                    return aValue < bValue ? 1 : -1;
                }
            });
        } else {
            // Default sort by lastSync descending
            allSources.sort((a, b) => new Date(b.lastSync).getTime() - new Date(a.lastSync).getTime());
        }

        // Apply pagination
        const startIndex = (options.page - 1) * options.limit;
        const endIndex = startIndex + options.limit;
        const paginatedSources = allSources.slice(startIndex, endIndex);

        return {
            items: paginatedSources.map(s => ({ ...s })),
            pagination: {
                page: options.page,
                limit: options.limit,
                total: allSources.length,
                totalPages: Math.ceil(allSources.length / options.limit)
            }
        };
    }

    async findActive(): Promise<DataSource[]> {
        const allSources = Array.from(this.sources.values());
        return allSources.filter(s => s.status === 'active').map(s => ({ ...s }));
    }

    async delete(id: string): Promise<boolean> {
        const deleted = this.sources.delete(id);
        this.healthStatus.delete(id);
        return deleted;
    }

    async saveHealth(health: DataSourceHealth): Promise<void> {
        this.healthStatus.set(health.sourceId, { ...health });
    }

    async getHealth(sourceId: string): Promise<DataSourceHealth | null> {
        const health = this.healthStatus.get(sourceId);
        return health ? { ...health } : null;
    }
}

// Implementation with in-memory storage
export class DataSourceManagerImpl implements DataSourceManager {
    private storage = new InMemoryDataSourceStorage();

    async getActiveSources(): Promise<DataSource[]> {
        return this.storage.findActive();
    }

    async getAllSources(options: PaginationOptions): Promise<PaginationResult<DataSource>> {
        return this.storage.findAll(options);
    }

    async getSourceById(id: string): Promise<DataSource | null> {
        return this.storage.findById(id);
    }

    async createSource(source: DataSourceModel): Promise<DataSource> {
        // Validate connection before creating
        const isValid = await this.validateSourceConnection(source);

        const newSource: DataSource = {
            ...source.toJSON(),
            status: isValid ? 'active' : 'error',
            errorMessage: isValid ? undefined : 'Connection validation failed',
            lastSync: new Date(),
            documentCount: 0
        };

        const savedSource = await this.storage.save(newSource);

        // Initialize health status
        await this.storage.saveHealth({
            sourceId: savedSource.id,
            isHealthy: isValid,
            lastCheck: new Date(),
            responseTime: isValid ? Math.floor(Math.random() * 100) + 20 : undefined,
            errorCount: isValid ? 0 : 1,
            lastError: isValid ? undefined : 'Connection validation failed'
        });

        return savedSource;
    }

    async updateSource(id: string, source: DataSourceModel): Promise<DataSource> {
        const existingSource = await this.storage.findById(id);
        if (!existingSource) {
            throw new Error('Data source not found');
        }

        // Validate connection for updated configuration
        const isValid = await this.validateSourceConnection(source);

        const updatedSource: DataSource = {
            ...source.toJSON(),
            id, // Keep the original ID
            status: isValid ? 'active' : 'error',
            errorMessage: isValid ? undefined : 'Connection validation failed',
            lastSync: isValid ? new Date() : existingSource.lastSync,
            documentCount: existingSource.documentCount // Preserve document count
        };

        const savedSource = await this.storage.save(updatedSource);

        // Update health status
        const existingHealth = await this.storage.getHealth(id);
        await this.storage.saveHealth({
            sourceId: id,
            isHealthy: isValid,
            lastCheck: new Date(),
            responseTime: isValid ? Math.floor(Math.random() * 100) + 20 : undefined,
            errorCount: isValid ? (existingHealth?.errorCount || 0) : (existingHealth?.errorCount || 0) + 1,
            lastError: isValid ? undefined : 'Connection validation failed'
        });

        return savedSource;
    }

    async deleteSource(id: string): Promise<boolean> {
        const source = await this.storage.findById(id);
        if (!source) {
            return false;
        }

        return this.storage.delete(id);
    }

    async triggerSync(id: string): Promise<SyncResult> {
        const source = await this.storage.findById(id);
        if (!source) {
            throw new Error('Data source not found');
        }

        if (source.status !== 'active') {
            throw new Error('Data source must be active to trigger sync');
        }

        // Update source status to syncing
        const updatedSource: DataSource = {
            ...source,
            status: 'syncing',
            lastSync: new Date()
        };
        await this.storage.save(updatedSource);

        // Simulate sync process
        const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const estimatedDuration = Math.floor(Math.random() * 300) + 60; // 1-6 minutes

        // Simulate async sync completion (in real implementation this would be handled by a background job)
        setTimeout(async () => {
            const currentSource = await this.storage.findById(id);
            if (currentSource && currentSource.status === 'syncing') {
                const completedSource: DataSource = {
                    ...currentSource,
                    status: 'active',
                    lastSync: new Date(),
                    documentCount: Math.floor(Math.random() * 1000) + 100 // Simulate document count update
                };
                await this.storage.save(completedSource);

                // Update health status
                await this.storage.saveHealth({
                    sourceId: id,
                    isHealthy: true,
                    lastCheck: new Date(),
                    responseTime: Math.floor(Math.random() * 100) + 20,
                    errorCount: 0,
                    lastError: undefined
                });
            }
        }, estimatedDuration * 1000);

        return {
            syncId,
            estimatedDuration,
            status: 'started'
        };
    }

    async checkHealth(id: string): Promise<DataSourceHealth> {
        const source = await this.storage.findById(id);
        if (!source) {
            throw new Error('Data source not found');
        }

        let health = await this.storage.getHealth(id);

        if (!health) {
            // Initialize health status if not exists
            health = {
                sourceId: id,
                isHealthy: source.status === 'active',
                lastCheck: new Date(),
                responseTime: source.status === 'active' ? Math.floor(Math.random() * 100) + 20 : undefined,
                errorCount: source.status === 'error' ? 1 : 0,
                lastError: source.errorMessage
            };
            await this.storage.saveHealth(health);
        } else {
            // Update health check timestamp
            health = {
                ...health,
                lastCheck: new Date(),
                isHealthy: source.status === 'active',
                responseTime: source.status === 'active' ? Math.floor(Math.random() * 100) + 20 : undefined
            };
            await this.storage.saveHealth(health);
        }

        return health;
    }

    async validateSourceConnection(source: DataSourceModel): Promise<boolean> {
        // Simulate connection validation based on source type
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));

        const config = source.config;

        switch (source.type) {
            case 'file':
                // Validate file path exists and is accessible
                return config.filePath !== undefined && config.filePath.length > 0;

            case 'database':
                // Validate database connection string and credentials
                return config.connectionString !== undefined &&
                    config.connectionString.includes('://') &&
                    config.credentials !== undefined &&
                    config.credentials.username !== undefined &&
                    config.credentials.password !== undefined;

            case 'api':
                // Validate API endpoint and credentials
                return config.apiEndpoint !== undefined &&
                    config.apiEndpoint.startsWith('http') &&
                    config.credentials !== undefined &&
                    (config.credentials.apiKey !== undefined ||
                        config.credentials.token !== undefined ||
                        (config.credentials.username !== undefined && config.credentials.password !== undefined));

            default:
                return false;
        }
    }
}
