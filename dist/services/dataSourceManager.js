"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSourceManagerImpl = void 0;
class InMemoryDataSourceStorage {
    constructor() {
        this.sources = new Map();
        this.healthStatus = new Map();
    }
    async save(source) {
        this.sources.set(source.id, { ...source });
        return { ...source };
    }
    async findById(id) {
        const source = this.sources.get(id);
        return source ? { ...source } : null;
    }
    async findAll(options) {
        const allSources = Array.from(this.sources.values());
        if (options.sortBy) {
            allSources.sort((a, b) => {
                const aValue = a[options.sortBy];
                const bValue = b[options.sortBy];
                if (options.sort === 'asc') {
                    return aValue > bValue ? 1 : -1;
                }
                else {
                    return aValue < bValue ? 1 : -1;
                }
            });
        }
        else {
            allSources.sort((a, b) => new Date(b.lastSync).getTime() - new Date(a.lastSync).getTime());
        }
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
    async findActive() {
        const allSources = Array.from(this.sources.values());
        return allSources.filter(s => s.status === 'active').map(s => ({ ...s }));
    }
    async delete(id) {
        const deleted = this.sources.delete(id);
        this.healthStatus.delete(id);
        return deleted;
    }
    async saveHealth(health) {
        this.healthStatus.set(health.sourceId, { ...health });
    }
    async getHealth(sourceId) {
        const health = this.healthStatus.get(sourceId);
        return health ? { ...health } : null;
    }
}
class DataSourceManagerImpl {
    constructor() {
        this.storage = new InMemoryDataSourceStorage();
    }
    async getActiveSources() {
        return this.storage.findActive();
    }
    async getAllSources(options) {
        return this.storage.findAll(options);
    }
    async getSourceById(id) {
        return this.storage.findById(id);
    }
    async createSource(source) {
        const isValid = await this.validateSourceConnection(source);
        const newSource = {
            ...source.toJSON(),
            status: isValid ? 'active' : 'error',
            errorMessage: isValid ? undefined : 'Connection validation failed',
            lastSync: new Date(),
            documentCount: 0
        };
        const savedSource = await this.storage.save(newSource);
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
    async updateSource(id, source) {
        const existingSource = await this.storage.findById(id);
        if (!existingSource) {
            throw new Error('Data source not found');
        }
        const isValid = await this.validateSourceConnection(source);
        const updatedSource = {
            ...source.toJSON(),
            id,
            status: isValid ? 'active' : 'error',
            errorMessage: isValid ? undefined : 'Connection validation failed',
            lastSync: isValid ? new Date() : existingSource.lastSync,
            documentCount: existingSource.documentCount
        };
        const savedSource = await this.storage.save(updatedSource);
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
    async deleteSource(id) {
        const source = await this.storage.findById(id);
        if (!source) {
            return false;
        }
        return this.storage.delete(id);
    }
    async triggerSync(id) {
        const source = await this.storage.findById(id);
        if (!source) {
            throw new Error('Data source not found');
        }
        if (source.status !== 'active') {
            throw new Error('Data source must be active to trigger sync');
        }
        const updatedSource = {
            ...source,
            status: 'syncing',
            lastSync: new Date()
        };
        await this.storage.save(updatedSource);
        const syncId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const estimatedDuration = Math.floor(Math.random() * 300) + 60;
        setTimeout(async () => {
            const currentSource = await this.storage.findById(id);
            if (currentSource && currentSource.status === 'syncing') {
                const completedSource = {
                    ...currentSource,
                    status: 'active',
                    lastSync: new Date(),
                    documentCount: Math.floor(Math.random() * 1000) + 100
                };
                await this.storage.save(completedSource);
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
    async checkHealth(id) {
        const source = await this.storage.findById(id);
        if (!source) {
            throw new Error('Data source not found');
        }
        let health = await this.storage.getHealth(id);
        if (!health) {
            health = {
                sourceId: id,
                isHealthy: source.status === 'active',
                lastCheck: new Date(),
                responseTime: source.status === 'active' ? Math.floor(Math.random() * 100) + 20 : undefined,
                errorCount: source.status === 'error' ? 1 : 0,
                lastError: source.errorMessage
            };
            await this.storage.saveHealth(health);
        }
        else {
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
    async validateSourceConnection(source) {
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
        const config = source.config;
        switch (source.type) {
            case 'file':
                return config.filePath !== undefined && config.filePath.length > 0;
            case 'database':
                return config.connectionString !== undefined &&
                    config.connectionString.includes('://') &&
                    config.credentials !== undefined &&
                    config.credentials.username !== undefined &&
                    config.credentials.password !== undefined;
            case 'api':
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
exports.DataSourceManagerImpl = DataSourceManagerImpl;
//# sourceMappingURL=dataSourceManager.js.map