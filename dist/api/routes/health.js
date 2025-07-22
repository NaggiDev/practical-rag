"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthRoutes = void 0;
const express_1 = require("express");
const healthCheck_1 = require("../../services/healthCheck");
const rateLimit_1 = require("../middleware/rateLimit");
const validation_1 = require("../middleware/validation");
exports.healthRoutes = (0, express_1.Router)();
exports.healthRoutes.use(rateLimit_1.healthRateLimitMiddleware);
const healthCheckConfig = {
    checkInterval: 30000,
    timeoutMs: 5000,
    retryAttempts: 3,
    alertThresholds: {
        responseTime: 5000,
        errorRate: 0.1,
        consecutiveFailures: 3,
        memoryUsage: 0.85,
        cpuUsage: 0.9,
        diskUsage: 0.9,
        cacheHitRate: 0.3,
        dataSourceFailurePercentage: 0.5
    }
};
let healthCheckService;
const initializeHealthCheckService = () => {
    if (!healthCheckService) {
        const dependencies = {};
        healthCheckService = new healthCheck_1.HealthCheckService(healthCheckConfig, dependencies);
        healthCheckService.on('alert', (alert) => {
            console.warn('Health Check Alert:', alert);
        });
        healthCheckService.on('healthCheckError', (error) => {
            console.error('Health Check Service Error:', error);
        });
    }
    return healthCheckService;
};
exports.healthRoutes.get('/', async (_req, res, next) => {
    try {
        const healthService = initializeHealthCheckService();
        const systemHealth = await healthService.getSystemHealth();
        const health = {
            status: systemHealth.status,
            timestamp: systemHealth.timestamp,
            services: systemHealth.components.map(component => ({
                name: component.name,
                status: component.status === 'degraded' ? 'healthy' : component.status,
                responseTime: component.responseTime,
                lastCheck: component.lastCheck,
                details: component.details
            })),
            uptime: systemHealth.uptime / 1000
        };
        const statusCode = systemHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/detailed', (0, validation_1.validateWithJoi)(validation_1.commonSchemas.healthParams, 'query'), async (req, res, next) => {
    try {
        const startTime = Date.now();
        const { includeMetrics } = req.query;
        const healthService = initializeHealthCheckService();
        const systemHealth = await healthService.getSystemHealth();
        const health = {
            status: systemHealth.status,
            timestamp: systemHealth.timestamp,
            services: systemHealth.components.map(component => ({
                name: component.name,
                status: component.status === 'degraded' ? 'healthy' : component.status,
                responseTime: component.responseTime,
                lastCheck: component.lastCheck,
                details: component.details
            })),
            uptime: systemHealth.uptime / 1000
        };
        if (includeMetrics) {
            health.metrics = {
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                responseTime: Date.now() - startTime,
                activeConnections: process.getActiveResourcesInfo?.()?.length || 0,
                version: systemHealth.version,
                environment: systemHealth.environment
            };
        }
        const statusCode = systemHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/ready', async (_req, res, next) => {
    try {
        const criticalServices = await checkCriticalServices();
        const isReady = criticalServices.every(service => service.status === 'healthy');
        if (isReady) {
            res.status(200).json({
                status: 'ready',
                timestamp: new Date(),
                services: criticalServices
            });
        }
        else {
            res.status(503).json({
                status: 'not_ready',
                timestamp: new Date(),
                services: criticalServices
            });
        }
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/live', async (_req, res, next) => {
    try {
        res.status(200).json({
            status: 'alive',
            timestamp: new Date(),
            uptime: process.uptime()
        });
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/component/:componentName', async (req, res, next) => {
    try {
        const { componentName } = req.params;
        const healthService = initializeHealthCheckService();
        const componentHealth = await healthService.checkComponent(componentName);
        const statusCode = componentHealth.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json({
            component: componentHealth,
            timestamp: new Date()
        });
    }
    catch (error) {
        if (error instanceof Error && error.message.includes('Unknown component')) {
            res.status(404).json({
                error: {
                    code: 'COMPONENT_NOT_FOUND',
                    message: error.message,
                    timestamp: new Date(),
                    correlationId: req.correlationId
                }
            });
        }
        else {
            next(error);
        }
    }
});
exports.healthRoutes.get('/sources', async (_req, res, next) => {
    try {
        const healthService = initializeHealthCheckService();
        const dataSourceHealth = await healthService.getDataSourceHealth();
        const statusCode = dataSourceHealth.unhealthySources === 0 ? 200 : 503;
        res.status(statusCode).json(dataSourceHealth);
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.post('/monitoring/start', async (_req, res, next) => {
    try {
        const healthService = initializeHealthCheckService();
        healthService.start();
        res.status(200).json({
            message: 'Health monitoring started',
            interval: healthCheckConfig.checkInterval,
            timestamp: new Date()
        });
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.post('/monitoring/stop', async (_req, res, next) => {
    try {
        const healthService = initializeHealthCheckService();
        healthService.stop();
        res.status(200).json({
            message: 'Health monitoring stopped',
            timestamp: new Date()
        });
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/monitoring/status', async (_req, res, next) => {
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
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.post('/component/:componentName/reset', async (req, res, next) => {
    try {
        const { componentName } = req.params;
        const healthService = initializeHealthCheckService();
        healthService.resetComponentFailureCount(componentName);
        res.status(200).json({
            message: `Failure count reset for component: ${componentName}`,
            component: componentName,
            timestamp: new Date()
        });
    }
    catch (error) {
        next(error);
    }
});
exports.healthRoutes.get('/trends', async (_req, res, next) => {
    try {
        const healthService = initializeHealthCheckService();
        const trends = await healthService.getPerformanceTrends();
        res.status(200).json({
            trends,
            timestamp: new Date()
        });
    }
    catch (error) {
        next(error);
    }
});
async function checkCriticalServices() {
    const healthService = initializeHealthCheckService();
    const systemHealth = await healthService.getSystemHealth();
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
//# sourceMappingURL=health.js.map