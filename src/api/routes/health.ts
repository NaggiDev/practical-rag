import { NextFunction, Response, Router } from 'express';
import { HealthResponse, ServiceHealth } from '../../models/response';
import { HealthCheckConfig, HealthCheckService } from '../../services/healthCheck';
import { healthRateLimitMiddleware } from '../middleware/rateLimit';
import { commonSchemas, validateWithJoi } from '../middleware/validation';

export const healthRoutes = Router();

// Apply rate limiting to health endpoints
healthRoutes.use(healthRateLimitMiddleware);

// Initialize health check service (in production, this would be dependency injected)
const healthCheckConfig: HealthCheckConfig = {
    checkInterval: 30000, // 30 seconds
    timeoutMs: 5000,
    retryAttempts: 3,
    alertThresholds: {
        responseTime: 5000, // 5 seconds
        errorRate: 0.1, // 10%
        consecutiveFailures: 3,
        memoryUsage: 0.85, // 85% memory usage
        cpuUsage: 0.9, // 90% CPU usage
        diskUsage: 0.9, // 90% disk usage
        cacheHitRate: 0.3, // 30% minimum hit rate
        dataSourceFailurePercentage: 0.5 // 50% of data sources can fail before system is unhealthy
    }
};

// These would be injected in a real application
let healthCheckService: HealthCheckService;

// Initialize health check service with dependencies
const initializeHealthCheckService = () => {
    if (!healthCheckService) {
        // In production, these dependencies would be properly injected
        const dependencies = {
            // cacheManager: new CacheManager(cacheConfig),
            // dataSourceManager: new DataSourceManagerImpl(),
            // monitoringService: new MonitoringService(),
            // embeddingService: new EmbeddingService(embeddingConfig),
            // vectorSearchEngine: new VectorSearchEngine(vectorConfig)
        };

        healthCheckService = new HealthCheckService(healthCheckConfig, dependencies);

        // Set up alert handling
        healthCheckService.on('alert', (alert) => {
            console.warn('Health Check Alert:', alert);
            // In production, this would integrate with alerting systems
        });

        healthCheckService.on('healthCheckError', (error) => {
            console.error('Health Check Service Error:', error);
        });
    }
    return healthCheckService;
};

/**
 * Basic health check endpoint
 * GET /health
 */
healthRoutes.get('/', async (_req: any, res: Response, next: NextFunction) => {
    try {
        const healthService = initializeHealthCheckService();
        const systemHealth = await healthService.getSystemHealth();

        // Convert to expected response format
        const health: HealthResponse = {
            status: systemHealth.status,
            timestamp: systemHealth.timestamp,
            services: systemHealth.components.map(component => ({
                name: component.name,
                status: component.status === 'degraded' ? 'healthy' : component.status,
                responseTime: component.responseTime,
                lastCheck: component.lastCheck,
                details: component.details
            })),
            uptime: systemHealth.uptime / 1000 // Convert to seconds
        };

        const statusCode = systemHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
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
            const { includeMetrics } = req.query as any;
            const healthService = initializeHealthCheckService();

            const systemHealth = await healthService.getSystemHealth();

            // Convert to expected response format
            const health: HealthResponse = {
                status: systemHealth.status,
                timestamp: systemHealth.timestamp,
                services: systemHealth.components.map(component => ({
                    name: component.name,
                    status: component.status === 'degraded' ? 'healthy' : component.status,
                    responseTime: component.responseTime,
                    lastCheck: component.lastCheck,
                    details: component.details
                })),
                uptime: systemHealth.uptime / 1000 // Convert to seconds
            };

            // Add metrics if requested
            if (includeMetrics) {
                (health as any).metrics = {
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage(),
                    responseTime: Date.now() - startTime,
                    activeConnections: (process as any).getActiveResourcesInfo?.()?.length || 0,
                    version: systemHealth.version,
                    environment: systemHealth.environment
                };
            }

            const statusCode = systemHealth.status === 'healthy' ? 200 : 503;
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
 * Component-specific health check endpoint
 * GET /health/component/:componentName
 */
healthRoutes.get('/component/:componentName', async (req: any, res: Response, next: NextFunction) => {
    try {
        const { componentName } = req.params;
        const healthService = initializeHealthCheckService();

        const componentHealth = await healthService.checkComponent(componentName);

        const statusCode = componentHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json({
            component: componentHealth,
            timestamp: new Date()
        });
    } catch (error) {
        if (error instanceof Error && error.message.includes('Unknown component')) {
            res.status(404).json({
                error: {
                    code: 'COMPONENT_NOT_FOUND',
                    message: error.message,
                    timestamp: new Date(),
                    correlationId: (req as any).correlationId
                }
            });
        } else {
            next(error);
        }
    }
});

/**
 * Data sources health summary endpoint
 * GET /health/sources
 */
healthRoutes.get('/sources', async (_req: any, res: Response, next: NextFunction) => {
    try {
        const healthService = initializeHealthCheckService();
        const dataSourceHealth = await healthService.getDataSourceHealth();

        const statusCode = dataSourceHealth.unhealthySources === 0 ? 200 : 503;
        res.status(statusCode).json(dataSourceHealth);
    } catch (error) {
        next(error);
    }
});

/**
 * Start continuous health monitoring
 * POST /health/monitoring/start
 */
healthRoutes.post('/monitoring/start', async (_req: any, res: Response, next: NextFunction) => {
    try {
        const healthService = initializeHealthCheckService();
        healthService.start();

        res.status(200).json({
            message: 'Health monitoring started',
            interval: healthCheckConfig.checkInterval,
            timestamp: new Date()
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Stop continuous health monitoring
 * POST /health/monitoring/stop
 */
healthRoutes.post('/monitoring/stop', async (_req: any, res: Response, next: NextFunction) => {
    try {
        const healthService = initializeHealthCheckService();
        healthService.stop();

        res.status(200).json({
            message: 'Health monitoring stopped',
            timestamp: new Date()
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get health monitoring status
 * GET /health/monitoring/status
 */
healthRoutes.get('/monitoring/status', async (_req: any, res: Response, next: NextFunction) => {
    try {
        const healthService = initializeHealthCheckService();
        const lastCheck = healthService.getLastHealthCheck();
        const failureCounts = healthService.getComponentFailureCounts();

        res.status(200).json({
            lastHealthCheck: lastCheck,
            componentFailureCounts: Object.fromEntries(failureCounts),
            config: healthCheckConfig,
            timestamp: new Date()
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Reset component failure count
 * POST /health/component/:componentName/reset
 */
healthRoutes.post('/component/:componentName/reset', async (req: any, res: Response, next: NextFunction) => {
    try {
        const { componentName } = req.params;
        const healthService = initializeHealthCheckService();

        healthService.resetComponentFailureCount(componentName);

        res.status(200).json({
            message: `Failure count reset for component: ${componentName}`,
            component: componentName,
            timestamp: new Date()
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Get performance trends
 * GET /health/trends
 */
healthRoutes.get('/trends', async (_req: any, res: Response, next: NextFunction) => {
    try {
        const healthService = initializeHealthCheckService();

        // This method needs to be added to the HealthCheckService
        const trends = await healthService.getPerformanceTrends();

        res.status(200).json({
            trends,
            timestamp: new Date()
        });
    } catch (error) {
        next(error);
    }
});

/**
 * Check critical services for readiness
 */
async function checkCriticalServices(): Promise<ServiceHealth[]> {
    const healthService = initializeHealthCheckService();
    const systemHealth = await healthService.getSystemHealth();

    // Filter to only critical components
    const criticalComponents = ['api', 'cache', 'vector_search'];

    return systemHealth.components
        .filter(component => criticalComponents.includes(component.name))
        .map(component => ({
            name: component.name,
            status: component.status === 'degraded' ? 'healthy' : component.status,
            responseTime: component.responseTime,
            lastCheck: component.lastCheck,
            details: component.details
        }));
}
