"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourcesRoutes = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const uuid_1 = require("uuid");
const dataSource_1 = require("../../models/dataSource");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const validation_1 = require("../middleware/validation");
exports.sourcesRoutes = (0, express_1.Router)();
exports.sourcesRoutes.use(rateLimit_1.sourcesRateLimitMiddleware);
exports.sourcesRoutes.get('/', (0, validation_1.validateWithJoi)(validation_1.commonSchemas.pagination, 'query'), async (req, res, next) => {
    try {
        const { page, limit } = req.query;
        const mockSources = await getDataSources(page, limit);
        res.status(200).json({
            sources: mockSources.sources,
            pagination: mockSources.pagination,
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.sourcesRoutes.post('/', (0, auth_1.requireRole)('user'), (0, validation_1.validateContentType)(['application/json']), (0, validation_1.validateWithJoi)(validation_1.commonSchemas.dataSourceRequest, 'body'), async (req, res, next) => {
    try {
        const { name, type, config } = req.body;
        const configModel = new dataSource_1.DataSourceConfigModel(config, type);
        const dataSource = new dataSource_1.DataSourceModel({
            name,
            type,
            config: configModel.config,
            status: 'inactive'
        });
        const savedSource = await createDataSource(dataSource);
        res.status(201).json({
            source: savedSource.toJSON(),
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                createdBy: req.userId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.sourcesRoutes.get('/:sourceId', (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const source = await getDataSourceById(sourceId);
        if (!source) {
            return res.status(404).json({
                error: {
                    code: 'SOURCE_NOT_FOUND',
                    message: 'Data source not found',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        res.status(200).json({
            source: source.toJSON(),
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.sourcesRoutes.put('/:sourceId', (0, auth_1.requireRole)('user'), (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), (0, validation_1.validateContentType)(['application/json']), (0, validation_1.validateWithJoi)(validation_1.commonSchemas.dataSourceRequest, 'body'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const { name, type, config } = req.body;
        const existingSource = await getDataSourceById(sourceId);
        if (!existingSource) {
            return res.status(404).json({
                error: {
                    code: 'SOURCE_NOT_FOUND',
                    message: 'Data source not found',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        const configModel = new dataSource_1.DataSourceConfigModel(config, type);
        const updatedSource = new dataSource_1.DataSourceModel({
            ...existingSource.toJSON(),
            name,
            type,
            config: configModel.config,
            status: 'inactive'
        });
        const savedSource = await updateDataSource(sourceId, updatedSource);
        res.status(200).json({
            source: savedSource.toJSON(),
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                updatedBy: req.userId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.sourcesRoutes.delete('/:sourceId', (0, auth_1.requireRole)('user'), (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const existingSource = await getDataSourceById(sourceId);
        if (!existingSource) {
            return res.status(404).json({
                error: {
                    code: 'SOURCE_NOT_FOUND',
                    message: 'Data source not found',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        const deleted = await deleteDataSource(sourceId);
        if (!deleted) {
            return res.status(500).json({
                error: {
                    code: 'DELETE_FAILED',
                    message: 'Failed to delete data source',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        res.status(200).json({
            message: 'Data source deleted successfully',
            sourceId,
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                deletedBy: req.userId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.sourcesRoutes.post('/:sourceId/sync', (0, auth_1.requireRole)('user'), (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const source = await getDataSourceById(sourceId);
        if (!source) {
            return res.status(404).json({
                error: {
                    code: 'SOURCE_NOT_FOUND',
                    message: 'Data source not found',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        if (source.status !== 'active') {
            return res.status(400).json({
                error: {
                    code: 'SOURCE_NOT_ACTIVE',
                    message: 'Data source must be active to trigger sync',
                    details: {
                        currentStatus: source.status
                    },
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        const syncResult = await triggerSync(sourceId);
        res.status(200).json({
            message: 'Sync triggered successfully',
            sourceId,
            syncId: syncResult.syncId,
            estimatedDuration: syncResult.estimatedDuration,
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                triggeredBy: req.userId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
exports.sourcesRoutes.get('/:sourceId/health', (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const source = await getDataSourceById(sourceId);
        if (!source) {
            return res.status(404).json({
                error: {
                    code: 'SOURCE_NOT_FOUND',
                    message: 'Data source not found',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        const healthStatus = await checkDataSourceHealth(sourceId);
        res.status(200).json({
            sourceId,
            health: healthStatus,
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId
            }
        });
    }
    catch (error) {
        next(error);
    }
});
async function getDataSources(page, limit, _sort, _sortBy) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
        sources: [],
        pagination: {
            page,
            limit,
            total: 0,
            totalPages: 0
        }
    };
}
async function createDataSource(dataSource) {
    await new Promise(resolve => setTimeout(resolve, 200));
    return dataSource.updateStatus('active');
}
async function getDataSourceById(_sourceId) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return null;
}
async function updateDataSource(_sourceId, dataSource) {
    await new Promise(resolve => setTimeout(resolve, 150));
    return dataSource.updateStatus('active');
}
async function deleteDataSource(_sourceId) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return true;
}
async function triggerSync(_sourceId) {
    await new Promise(resolve => setTimeout(resolve, 50));
    return {
        syncId: (0, uuid_1.v4)(),
        estimatedDuration: 300
    };
}
async function checkDataSourceHealth(_sourceId) {
    await new Promise(resolve => setTimeout(resolve, 100));
    return {
        status: 'healthy',
        lastCheck: new Date(),
        responseTime: 45,
        details: {
            connection: 'active',
            lastSync: new Date(Date.now() - 3600000),
            documentCount: 1250
        }
    };
}
//# sourceMappingURL=sources.js.map