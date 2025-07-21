"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sourcesRoutes = void 0;
const express_1 = require("express");
const joi_1 = __importDefault(require("joi"));
const dataSource_1 = require("../../models/dataSource");
const dataSourceManager_1 = require("../../services/dataSourceManager");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const validation_1 = require("../middleware/validation");
exports.sourcesRoutes = (0, express_1.Router)();
exports.sourcesRoutes.use(rateLimit_1.sourcesRateLimitMiddleware);
const dataSourceManager = new dataSourceManager_1.DataSourceManagerImpl();
function handleValidationError(error, req, res) {
    if (error instanceof Error && (error.message.includes('validation failed') ||
        error.message.includes('File type') ||
        error.message.includes('Database connection string') ||
        error.message.includes('API credentials') ||
        error.message.includes('offsetParam') ||
        error.message.includes('cursorParam') ||
        error.message.includes('pageParam'))) {
        res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: error.message,
                timestamp: new Date(),
                correlationId: req.correlationId
            }
        });
        return true;
    }
    return false;
}
exports.sourcesRoutes.get('/', (0, validation_1.validateWithJoi)(validation_1.commonSchemas.pagination, 'query'), async (req, res, next) => {
    try {
        const { page, limit, sort, sortBy } = req.query;
        const result = await dataSourceManager.getAllSources({
            page,
            limit,
            sort,
            sortBy
        });
        res.status(200).json({
            sources: result.items,
            pagination: result.pagination,
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
        const savedSource = await dataSourceManager.createSource(dataSource);
        res.status(201).json({
            source: savedSource,
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                createdBy: req.userId
            }
        });
    }
    catch (error) {
        if (handleValidationError(error, req, res)) {
            return;
        }
        next(error);
    }
});
exports.sourcesRoutes.get('/:sourceId', (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const source = await dataSourceManager.getSourceById(sourceId);
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
            source: source,
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
        const existingSource = await dataSourceManager.getSourceById(sourceId);
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
            ...existingSource,
            name,
            type,
            config: configModel.config,
            status: 'inactive'
        });
        const savedSource = await dataSourceManager.updateSource(sourceId, updatedSource);
        res.status(200).json({
            source: savedSource,
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                updatedBy: req.userId
            }
        });
    }
    catch (error) {
        if (handleValidationError(error, req, res)) {
            return;
        }
        next(error);
    }
});
exports.sourcesRoutes.delete('/:sourceId', (0, auth_1.requireRole)('user'), (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const existingSource = await dataSourceManager.getSourceById(sourceId);
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
        const deleted = await dataSourceManager.deleteSource(sourceId);
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
        const syncResult = await dataSourceManager.triggerSync(sourceId);
        res.status(200).json({
            message: 'Sync triggered successfully',
            sourceId,
            syncId: syncResult.syncId,
            estimatedDuration: syncResult.estimatedDuration,
            status: syncResult.status,
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                triggeredBy: req.userId
            }
        });
    }
    catch (error) {
        if (error instanceof Error) {
            if (error.message === 'Data source not found') {
                return res.status(404).json({
                    error: {
                        code: 'SOURCE_NOT_FOUND',
                        message: 'Data source not found',
                        timestamp: new Date(),
                        correlationId: req.correlationId
                    }
                });
            }
            if (error.message === 'Data source must be active to trigger sync') {
                return res.status(400).json({
                    error: {
                        code: 'SOURCE_NOT_ACTIVE',
                        message: error.message,
                        timestamp: new Date(),
                        correlationId: req.correlationId
                    }
                });
            }
        }
        next(error);
    }
});
exports.sourcesRoutes.get('/:sourceId/health', (0, validation_1.validateWithJoi)(joi_1.default.object({ sourceId: validation_1.commonSchemas.uuid }), 'params'), async (req, res, next) => {
    try {
        const { sourceId } = req.params;
        const healthStatus = await dataSourceManager.checkHealth(sourceId);
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
        if (error instanceof Error && error.message === 'Data source not found') {
            return res.status(404).json({
                error: {
                    code: 'SOURCE_NOT_FOUND',
                    message: 'Data source not found',
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        next(error);
    }
});
exports.sourcesRoutes.post('/validate', (0, auth_1.requireRole)('user'), (0, validation_1.validateContentType)(['application/json']), (0, validation_1.validateWithJoi)(validation_1.commonSchemas.dataSourceRequest, 'body'), async (req, res, next) => {
    try {
        const { name, type, config } = req.body;
        const configModel = new dataSource_1.DataSourceConfigModel(config, type);
        const tempSource = new dataSource_1.DataSourceModel({
            name,
            type,
            config: configModel.config,
            status: 'inactive'
        });
        const isValid = await dataSourceManager.validateSourceConnection(tempSource);
        res.status(200).json({
            valid: isValid,
            message: isValid ? 'Data source configuration is valid' : 'Data source configuration validation failed',
            validatedConfig: {
                name: tempSource.name,
                type: tempSource.type,
                config: tempSource.config
            },
            metadata: {
                timestamp: new Date(),
                correlationId: req.correlationId,
                validatedBy: req.userId
            }
        });
    }
    catch (error) {
        if (handleValidationError(error, req, res)) {
            return;
        }
        next(error);
    }
});
//# sourceMappingURL=sources.js.map