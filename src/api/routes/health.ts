import { NextFunction, Response, Router } from 'express';
import { HealthResponse, ServiceHealth } from '../../models/response';
import { healthRateLimitMiddleware } from '../middleware/rateLimit';
import { commonSchemas, validateWithJoi } from '../middleware/validation';

export const healthRoutes = Router();

// Apply rate limiting to health endpoints
healthRoutes.use(healthRateLimitMiddleware);

/**
 * Basic health check endpoint
 * GET /health
 */
healthRoutes.get('/', async (_req: any, res: Response, next: NextFunction) => {
    try {
        const startTime = Date.now();
        const uptime = process.uptime();

        // Basic health check
        const health: HealthResponse = {
            status: 'healthy',
            timestamp: new Date(),
            services: [
                {
                    name: 'api',
                    status: 'healthy',
                    responseTime: Date.now() - startTime,
                    lastCheck: new Date()
                }
            ],
            uptime
        };

        res.status(200).json(health);
    } catch (error) {
        next(error);
    }
});

/**
 * Detailed health check endpoint
 * GET /health/detailed
 */
healthRoutes.get('/detailed',
    validateWithJoi(commonSchemas.healthParams, 'query'),
    async (req: any, res: Response, next: NextFunction) => {
        try {
            const startTime = Date.now();
            const uptime = process.uptime();
            const { includeMetrics } = req.query as any;

            // Check all system components
            const services = await checkAllServices();

            // Determine overall system status
            const hasUnhealthyServices = services.some(service => service.status === 'unhealthy');
            const overallStatus = hasUnhealthyServices ? 'degraded' : 'healthy';

            const health: HealthResponse = {
                status: overallStatus,
                timestamp: new Date(),
                services,
                uptime
            };

            // Add metrics if requested
            if (includeMetrics) {
                (health as any).metrics = {
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    responseTime: Date.now() - startTime,
                    activeConnections: (process as any).getActiveResourcesInfo?.()?.length || 0
                };
            }

            const statusCode = overallStatus === 'healthy' ? 200 : 503;
            res.status(statusCode).json(health);
        } catch (error) {
            next(error);
        }
    }
);

/**
 * Readiness probe endpoint
 * GET /health/ready
 */
healthRoutes.get('/ready', async (_req: any, res: Response, next: NextFunction) => {
    try {
        // Check if all critical services are ready
        const criticalServices = await checkCriticalServices();
        const isReady = criticalServices.every(service => service.status === 'healthy');

        if (isReady) {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date(),
                services: criticalServices
            });
        } else {
            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date(),
                services: criticalServices
            });
        }
    } catch (error) {
        next(error);
    }
});

/**
 * Liveness probe endpoint
 * GET /health/live
 */
healthRoutes.get('/live', async (_req: any, res: Response, next: NextFunction) => {
    try {
        // Simple liveness check - if we can respond, we're alive
        res.status(200).json({
            status: 'alive',
            timestamp: new Date(),
            uptime: process.uptime()
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Check all system services
 */
async function checkAllServices(): Promise<ServiceHealth[]> {
    const services: ServiceHealth[] = [];

    // Check API service
    services.push(await checkApiService());

    // Check database connections
    services.push(await checkVectorDatabase());
    services.push(await checkRedisCache());

    // Check external services
    services.push(await checkEmbeddingService());

    // Check data sources (sample check)
    services.push(await checkDataSources());

    return services;
}

/**
 * Check critical services for readiness
 */
async function checkCriticalServices(): Promise<ServiceHealth[]> {
    const services: ServiceHealth[] = [];

    // Only check services that are critical for basic functionality
    services.push(await checkApiService());
    services.push(await checkVectorDatabase());
    services.push(await checkRedisCache());

    return services;
}

/**
 * Check API service health
 */
async function checkApiService(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
        // Basic API health check
        const responseTime = Date.now() - startTime;

        return {
            name: 'api',
            status: 'healthy',
            responseTime,
            lastCheck: new Date(),
            details: {
                version: '1.0.0',
                environment: process.env.NODE_ENV || 'development'
            }
        };
    } catch (error) {
        return {
            name: 'api',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Unknown error'
            }
        };
    }
}

/**
 * Check vector database health
 */
async function checkVectorDatabase(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
        // TODO: Implement actual vector database health check
        // For now, simulate a health check
        await new Promise(resolve => setTimeout(resolve, 10));

        return {
            name: 'vector_database',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                provider: process.env.VECTOR_DB_PROVIDER || 'faiss',
                connected: true
            }
        };
    } catch (error) {
        return {
            name: 'vector_database',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Connection failed'
            }
        };
    }
}

/**
 * Check Redis cache health
 */
async function checkRedisCache(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
        // TODO: Implement actual Redis health check
        // For now, simulate a health check
        await new Promise(resolve => setTimeout(resolve, 5));

        return {
            name: 'redis_cache',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                connected: true,
                memory_usage: 'normal'
            }
        };
    } catch (error) {
        return {
            name: 'redis_cache',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Connection failed'
            }
        };
    }
}

/**
 * Check embedding service health
 */
async function checkEmbeddingService(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
        // TODO: Implement actual embedding service health check
        // For now, simulate a health check
        await new Promise(resolve => setTimeout(resolve, 15));

        return {
            name: 'embedding_service',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                provider: process.env.EMBEDDING_PROVIDER || 'openai',
                model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002'
            }
        };
    } catch (error) {
        return {
            name: 'embedding_service',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Service unavailable'
            }
        };
    }
}

/**
 * Check data sources health
 */
async function checkDataSources(): Promise<ServiceHealth> {
    const startTime = Date.now();

    try {
        // TODO: Implement actual data sources health check
        // For now, simulate checking configured data sources
        await new Promise(resolve => setTimeout(resolve, 20));

        return {
            name: 'data_sources',
            status: 'healthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                total_sources: 0,
                active_sources: 0,
                failed_sources: 0
            }
        };
    } catch (error) {
        return {
            name: 'data_sources',
            status: 'unhealthy',
            responseTime: Date.now() - startTime,
            lastCheck: new Date(),
            details: {
                error: error instanceof Error ? error.message : 'Sources check failed'
            }
        };
    }
}
