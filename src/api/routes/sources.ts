import { NextFunction, Response, Router } from 'express';
import Joi from 'joi';
import { DataSourceConfigModel, DataSourceModel } from '../../models/dataSource';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';
import { requireRole } from '../middleware/auth';
import { sourcesRateLimitMiddleware } from '../middleware/rateLimit';
import { commonSchemas, validateContentType, validateWithJoi } from '../middleware/validation';

export const sourcesRoutes = Router();

// Apply sources-specific rate limiting
sourcesRoutes.use(sourcesRateLimitMiddleware);

// Initialize data source manager
const dataSourceManager = new DataSourceManagerImpl();

// Helper function to handle validation errors
function handleValidationError(error: any, req: any, res: Response): boolean {
    if (error instanceof Error && (
        error.message.includes('validation failed') ||
        error.message.includes('File type') ||
        error.message.includes('Database connection string') ||
        error.message.includes('API credentials') ||
        error.message.includes('offsetParam') ||
        error.message.includes('cursorParam') ||
        error.message.includes('pageParam')
    )) {
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

/**
 * Get all data sources
 * GET /sources
 */
sourcesRoutes.get('/',
    validateWithJoi(commonSchemas.pagination, 'query'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { page, limit, sort, sortBy } = req.query as any;

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

        } catch (error) {
            next(error);
        }
    }
);

/**
 * Create a new data source
 * POST /sources
 */
sourcesRoutes.post('/',
    requireRole('user') as any, // Require at least user role
    validateContentType(['application/json']),
    validateWithJoi(commonSchemas.dataSourceRequest, 'body'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { name, type, config } = req.body;

            // Validate type-specific configuration
            const configModel = new DataSourceConfigModel(config, type);

            // Create data source model
            const dataSource = new DataSourceModel({
                name,
                type,
                config: configModel.config,
                status: 'inactive'
            });

            // Save to storage and validate connection
            const savedSource = await dataSourceManager.createSource(dataSource);

            res.status(201).json({
                source: savedSource,
                metadata: {
                    timestamp: new Date(),
                    correlationId: req.correlationId,
                    createdBy: req.userId
                }
            });

        } catch (error) {
            if (handleValidationError(error, req, res)) {
                return;
            }
            next(error);
        }
    }
);

/**
 * Get specific data source by ID
 * GET /sources/:sourceId
 */
sourcesRoutes.get('/:sourceId',
    validateWithJoi(Joi.object({ sourceId: commonSchemas.uuid }), 'params'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { sourceId } = req.params;

            const source = await dataSourceManager.getSourceById(sourceId!);

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

        } catch (error) {
            next(error);
        }
    }
);

/**
 * Update data source configuration
 * PUT /sources/:sourceId
 */
sourcesRoutes.put('/:sourceId',
    requireRole('user') as any,
    validateWithJoi(Joi.object({ sourceId: commonSchemas.uuid }), 'params'),
    validateContentType(['application/json']),
    validateWithJoi(commonSchemas.dataSourceRequest, 'body'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { sourceId } = req.params;
            const { name, type, config } = req.body;

            // Check if source exists
            const existingSource = await dataSourceManager.getSourceById(sourceId!);
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

            // Validate type-specific configuration
            const configModel = new DataSourceConfigModel(config, type);

            // Update data source
            const updatedSource = new DataSourceModel({
                ...existingSource,
                name,
                type,
                config: configModel.config,
                status: 'inactive' // Reset status when configuration changes
            });

            // Save updated source and re-validate connection
            const savedSource = await dataSourceManager.updateSource(sourceId!, updatedSource);

            res.status(200).json({
                source: savedSource,
                metadata: {
                    timestamp: new Date(),
                    correlationId: req.correlationId,
                    updatedBy: req.userId
                }
            });

        } catch (error) {
            if (handleValidationError(error, req, res)) {
                return;
            }
            next(error);
        }
    }
);

/**
 * Delete data source
 * DELETE /sources/:sourceId
 */
sourcesRoutes.delete('/:sourceId',
    requireRole('user') as any,
    validateWithJoi(Joi.object({ sourceId: commonSchemas.uuid }), 'params'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { sourceId } = req.params;

            // Check if source exists
            const existingSource = await dataSourceManager.getSourceById(sourceId!);
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

            // Delete the data source
            const deleted = await dataSourceManager.deleteSource(sourceId!);

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

        } catch (error) {
            next(error);
        }
    }
);

/**
 * Trigger manual sync for data source
 * POST /sources/:sourceId/sync
 */
sourcesRoutes.post('/:sourceId/sync',
    requireRole('user') as any,
    validateWithJoi(Joi.object({ sourceId: commonSchemas.uuid }), 'params'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { sourceId } = req.params;

            // Check if source exists and trigger sync
            const syncResult = await dataSourceManager.triggerSync(sourceId!);

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

        } catch (error) {
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
    }
);

/**
 * Get data source health status
 * GET /sources/:sourceId/health
 */
sourcesRoutes.get('/:sourceId/health',
    validateWithJoi(Joi.object({ sourceId: commonSchemas.uuid }), 'params'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { sourceId } = req.params;

            // Check health status
            const healthStatus = await dataSourceManager.checkHealth(sourceId!);

            res.status(200).json({
                sourceId,
                health: healthStatus,
                metadata: {
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });

        } catch (error) {
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
    }
);

/**
 * Validate data source configuration
 * POST /sources/validate
 */
sourcesRoutes.post('/validate',
    requireRole('user') as any,
    validateContentType(['application/json']),
    validateWithJoi(commonSchemas.dataSourceRequest, 'body'),
    async (req: any, res: Response, next: NextFunction): Promise<any> => {
        try {
            const { name, type, config } = req.body;

            // Validate type-specific configuration
            const configModel = new DataSourceConfigModel(config, type);

            // Create temporary data source model for validation
            const tempSource = new DataSourceModel({
                name,
                type,
                config: configModel.config,
                status: 'inactive'
            });

            // Validate connection without saving
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

        } catch (error) {
            if (handleValidationError(error, req, res)) {
                return;
            }
            next(error);
        }
    }
);


