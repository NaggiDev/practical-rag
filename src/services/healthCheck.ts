import { EventEmitter } from 'events';
import { CacheManager } from './cache';
import { DataSourceManager } from './dataSourceManager';
import { EmbeddingService } from './embedding';
import { Alert, MonitoringService } from './monitoring';
import { VectorSearchEngine } from './vectorSearch';

export interface ComponentHealth {
    name: string;
    status: 'healthy' | 'degraded' | 'unhealthy';
    responseTime?: number;
    lastCheck: Date;
    details?: {
        [key: string]: any;
    };
    error?: string;
    metrics?: {
        [key: string]: number;
    };
}

export interface SystemHealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    components: ComponentHealth[];
    uptime: number;
    version: string;
    environment: string;
}

export interface HealthCheckConfig {
    checkInterval: number; // milliseconds
    timeoutMs: number;
    retryAttempts: number;
    alertThresholds: {
        responseTime: number;
        errorRate: number;
        consecutiveFailures: number;
        memoryUsage: number; // percentage (0-1)
        cpuUsage: number; // percentage (0-1)
        diskUsage?: number; // percentage (0-1)
        cacheHitRate: number; // minimum acceptable hit rate (0-1)
        dataSourceFailurePercentage: number; // percentage (0-1)
    };
}

export interface DataSourceHealthSummary {
    totalSources: number;
    healthySources: number;
    unhealthySources: number;
    degradedSources: number;
    lastChecked: Date;
    overallStatus: 'healthy' | 'degraded' | 'unhealthy';
    sources: Array<{
        id: string;
        name: string;
        type: string;
        status: 'healthy' | 'degraded' | 'unhealthy';
        responseTime?: number;
        lastError?: string;
        lastSuccessfulConnection?: Date;
        connectionAttempts?: number;
        consecutiveFailures?: number;
    }>;
}

export class HealthCheckService extends EventEmitter {
    private config: HealthCheckConfig;
    private cacheManager?: CacheManager;
    private dataSourceManager?: DataSourceManager;
    private monitoringService?: MonitoringService;
    private embeddingService?: EmbeddingService;
    private vectorSearchEngine?: VectorSearchEngine;

    private healthCheckInterval?: NodeJS.Timeout;
    private componentFailureCounts: Map<string, number> = new Map();
    private lastHealthCheck: Date = new Date();
    private startTime: Date = new Date();

    constructor(
        config: HealthCheckConfig,
        dependencies: {
            cacheManager?: CacheManager;
            dataSourceManager?: DataSourceManager;
            monitoringService?: MonitoringService;
            embeddingService?: EmbeddingService;
            vectorSearchEngine?: VectorSearchEngine;
        } = {}
    ) {
        super();
        this.config = config;
        this.cacheManager = dependencies.cacheManager;
        this.dataSourceManager = dependencies.dataSourceManager;
        this.monitoringService = dependencies.monitoringService;
        this.embeddingService = dependencies.embeddingService;
        this.vectorSearchEngine = dependencies.vectorSearchEngine;
    }

    public start(): void {
        if (this.healthCheckInterval) {
            this.stop();
        }

        this.healthCheckInterval = setInterval(
            () => this.performHealthCheck(),
            this.config.checkInterval
        );

        console.log(`Health check service started with ${this.config.checkInterval}ms interval`);
    }

    public stop(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = undefined;
        }
        console.log('Health check service stopped');
    }

    public async getSystemHealth(): Promise<SystemHealthStatus> {
        const components = await this.checkAllComponents();
        const overallStatus = this.determineOverallStatus(components);

        return {
            status: overallStatus,
            timestamp: new Date(),
            components,
            uptime: Date.now() - this.startTime.getTime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };
    }

    public async checkComponent(componentName: string): Promise<ComponentHealth> {
        const startTime = Date.now();

        switch (componentName) {
            case 'cache':
                return await this.checkCacheHealth();
            case 'data_sources':
                return await this.checkDataSourcesHealth();
            case 'embedding_service':
                return await this.checkEmbeddingServiceHealth();
            case 'vector_search':
                return await this.checkVectorSearchHealth();
            case 'monitoring':
                return await this.checkMonitoringHealth();
            case 'api':
                return await this.checkApiHealth();
            default:
                throw new Error(`Unknown component: ${componentName}`);
        }
    }

    public async getDataSourceHealth(): Promise<DataSourceHealthSummary> {
        if (!this.dataSourceManager) {
            return {
                totalSources: 0,
                healthySources: 0,
                unhealthySources: 0,
                degradedSources: 0,
                lastChecked: new Date(),
                overallStatus: 'degraded',
                sources: []
            };
        }

        try {
            const sources = await this.dataSourceManager.getAllSources({ page: 1, limit: 100 });
            const sourceHealthChecks = await Promise.allSettled(
                sources.items.map(async (source) => {
                    const startTime = Date.now();
                    try {
                        const health = await this.dataSourceManager!.checkHealth(source.id);

                        // Get stored connection metrics for this source
                        const connectionMetrics = this.getSourceConnectionMetrics(source.id);

                        // Update connection metrics
                        if (health.isHealthy) {
                            this.updateSourceConnectionMetrics(source.id, true);
                        } else {
                            this.updateSourceConnectionMetrics(source.id, false);
                        }

                        return {
                            id: source.id,
                            name: source.name,
                            type: source.type,
                            status: health.isHealthy ? 'healthy' as const : 'unhealthy' as const,
                            responseTime: health.responseTime || Date.now() - startTime,
                            lastError: health.lastError,
                            lastSuccessfulConnection: connectionMetrics.lastSuccessfulConnection,
                            connectionAttempts: connectionMetrics.connectionAttempts,
                            consecutiveFailures: connectionMetrics.consecutiveFailures
                        };
                    } catch (error) {
                        // Update connection metrics for failure
                        this.updateSourceConnectionMetrics(source.id, false);
                        const connectionMetrics = this.getSourceConnectionMetrics(source.id);

                        return {
                            id: source.id,
                            name: source.name,
                            type: source.type,
                            status: 'unhealthy' as const,
                            responseTime: Date.now() - startTime,
                            lastError: error instanceof Error ? error.message : 'Health check failed',
                            lastSuccessfulConnection: connectionMetrics.lastSuccessfulConnection,
                            connectionAttempts: connectionMetrics.connectionAttempts,
                            consecutiveFailures: connectionMetrics.consecutiveFailures
                        };
                    }
                })
            );

            const sourceResults = sourceHealthChecks
                .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
                .map(result => result.value);

            const healthySources = sourceResults.filter(s => s.status === 'healthy').length;
            const unhealthySources = sourceResults.filter(s => s.status === 'unhealthy').length;
            const degradedSources = sourceResults.filter(s => s.status === 'degraded').length;

            // Determine overall status
            let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

            if (sources.items.length === 0) {
                overallStatus = 'degraded'; // No sources configured
            } else if (unhealthySources === sources.items.length) {
                overallStatus = 'unhealthy'; // All sources are unhealthy
            } else if (unhealthySources > 0) {
                // Check if unhealthy sources exceed threshold
                const unhealthyPercentage = unhealthySources / sources.items.length;
                if (unhealthyPercentage >= this.config.alertThresholds.dataSourceFailurePercentage) {
                    overallStatus = 'unhealthy';
                } else {
                    overallStatus = 'degraded';
                }
            }

            // Trigger alerts if needed
            if (overallStatus === 'unhealthy') {
                await this.triggerAlert({
                    component: 'data_sources',
                    status: 'unhealthy',
                    unhealthyPercentage: unhealthySources / sources.items.length,
                    threshold: this.config.alertThresholds.dataSourceFailurePercentage,
                    message: `${unhealthySources} out of ${sources.items.length} data sources are unhealthy`
                });
            }

            return {
                totalSources: sources.items.length,
                healthySources,
                unhealthySources,
                degradedSources,
                lastChecked: new Date(),
                overallStatus,
                sources: sourceResults
            };
        } catch (error) {
            return {
                totalSources: 0,
                healthySources: 0,
                unhealthySources: 0,
                degradedSources: 0,
                lastChecked: new Date(),
                overallStatus: 'degraded',
                sources: []
            };
        }
    }

    // Track connection metrics for data sources
    private sourceConnectionMetrics: Map<string, {
        lastSuccessfulConnection: Date | null;
        connectionAttempts: number;
        consecutiveFailures: number;
    }> = new Map();

    private getSourceConnectionMetrics(sourceId: string) {
        if (!this.sourceConnectionMetrics.has(sourceId)) {
            this.sourceConnectionMetrics.set(sourceId, {
                lastSuccessfulConnection: null,
                connectionAttempts: 0,
                consecutiveFailures: 0
            });
        }
        return this.sourceConnectionMetrics.get(sourceId)!;
    }

    private updateSourceConnectionMetrics(sourceId: string, isSuccessful: boolean) {
        const metrics = this.getSourceConnectionMetrics(sourceId);
        metrics.connectionAttempts++;

        if (isSuccessful) {
            metrics.lastSuccessfulConnection = new Date();
            metrics.consecutiveFailures = 0;
        } else {
            metrics.consecutiveFailures++;

            // Alert if consecutive failures exceed threshold
            if (metrics.consecutiveFailures >= this.config.alertThresholds.consecutiveFailures) {
                this.triggerAlert({
                    component: `data_source:${sourceId}`,
                    status: 'unhealthy',
                    consecutiveFailures: metrics.consecutiveFailures,
                    threshold: this.config.alertThresholds.consecutiveFailures,
                    message: `Data source ${sourceId} has failed ${metrics.consecutiveFailures} consecutive connection attempts`
                });
            }
        }

        this.sourceConnectionMetrics.set(sourceId, metrics);
    }

    private async performHealthCheck(): Promise<void> {
        try {
            const systemHealth = await this.getSystemHealth();
            this.lastHealthCheck = systemHealth.timestamp;

            // Check for component failures and trigger alerts
            for (const component of systemHealth.components) {
                await this.handleComponentHealth(component);
            }

            // Emit health check event
            this.emit('healthCheck', systemHealth);

            // Check for performance degradation
            await this.checkPerformanceDegradation();

        } catch (error) {
            console.error('Health check failed:', error);
            this.emit('healthCheckError', error);
        }
    }

    public async checkComponentWithAlerts(componentName: string): Promise<ComponentHealth> {
        const componentHealth = await this.checkComponent(componentName);
        await this.handleComponentHealth(componentHealth);
        return componentHealth;
    }

    private async checkAllComponents(): Promise<ComponentHealth[]> {
        const componentChecks = [
            this.checkApiHealth(),
            this.checkCacheHealth(),
            this.checkDataSourcesHealth(),
            this.checkEmbeddingServiceHealth(),
            this.checkVectorSearchHealth(),
            this.checkMonitoringHealth()
        ];

        const results = await Promise.allSettled(componentChecks);

        return results.map((result, index) => {
            const componentNames = ['api', 'cache', 'data_sources', 'embedding_service', 'vector_search', 'monitoring'];

            if (result.status === 'fulfilled') {
                return result.value;
            } else {
                return {
                    name: componentNames[index] || 'unknown',
                    status: 'unhealthy' as const,
                    lastCheck: new Date(),
                    error: result.reason instanceof Error ? result.reason.message : 'Health check failed'
                };
            }
        });
    }

    private async checkApiHealth(): Promise<ComponentHealth> {
        const startTime = Date.now();

        try {
            // Check basic API functionality
            const memoryUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();

            const responseTime = Date.now() - startTime;

            // Consider API unhealthy if memory usage is too high
            const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
            const status = memoryUsagePercent > 90 ? 'degraded' : 'healthy';

            return {
                name: 'api',
                status,
                responseTime,
                lastCheck: new Date(),
                details: {
                    memoryUsage: {
                        used: memoryUsage.heapUsed,
                        total: memoryUsage.heapTotal,
                        percentage: memoryUsagePercent
                    },
                    cpuUsage,
                    uptime: process.uptime()
                }
            };
        } catch (error) {
            return {
                name: 'api',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                error: error instanceof Error ? error.message : 'API health check failed'
            };
        }
    }

    private async checkCacheHealth(): Promise<ComponentHealth> {
        const startTime = Date.now();

        if (!this.cacheManager) {
            return {
                name: 'cache',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                error: 'Cache manager not initialized'
            };
        }

        try {
            const isHealthy = await this.cacheManager.healthCheck();
            const stats = await this.cacheManager.getStats();
            const responseTime = Date.now() - startTime;

            // Determine status based on health check and hit rate
            let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
            if (!isHealthy) {
                status = 'unhealthy';
            } else if (stats.hitRate < 0.3) { // Less than 30% hit rate might indicate issues
                status = 'degraded';
            }

            return {
                name: 'cache',
                status,
                responseTime,
                lastCheck: new Date(),
                details: {
                    connected: isHealthy,
                    hitRate: stats.hitRate,
                    totalKeys: stats.totalKeys,
                    memoryUsage: stats.memoryUsage,
                    evictions: stats.evictions
                }
            };
        } catch (error) {
            return {
                name: 'cache',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                error: error instanceof Error ? error.message : 'Cache health check failed'
            };
        }
    }

    private async checkDataSourcesHealth(): Promise<ComponentHealth> {
        const startTime = Date.now();

        if (!this.dataSourceManager) {
            return {
                name: 'data_sources',
                status: 'degraded',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                details: {
                    message: 'Data source manager not initialized'
                }
            };
        }

        try {
            const healthSummary = await this.getDataSourceHealth();
            const responseTime = Date.now() - startTime;

            // Determine status based on source health
            let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
            if (healthSummary.totalSources === 0) {
                status = 'degraded'; // No sources configured
            } else if (healthSummary.unhealthySources === healthSummary.totalSources) {
                status = 'unhealthy'; // All sources are unhealthy
            } else if (healthSummary.unhealthySources > 0) {
                status = 'degraded'; // Some sources are unhealthy
            }

            return {
                name: 'data_sources',
                status,
                responseTime,
                lastCheck: new Date(),
                details: {
                    totalSources: healthSummary.totalSources,
                    healthySources: healthSummary.healthySources,
                    unhealthySources: healthSummary.unhealthySources,
                    degradedSources: healthSummary.degradedSources
                }
            };
        } catch (error) {
            return {
                name: 'data_sources',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                error: error instanceof Error ? error.message : 'Data sources health check failed'
            };
        }
    }

    private async checkEmbeddingServiceHealth(): Promise<ComponentHealth> {
        const startTime = Date.now();

        if (!this.embeddingService) {
            return {
                name: 'embedding_service',
                status: 'degraded',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                details: {
                    message: 'Embedding service not initialized'
                }
            };
        }

        try {
            // Test embedding generation with a simple text
            const testEmbedding = await this.embeddingService.generateEmbedding('health check test');
            const responseTime = Date.now() - startTime;

            const status = testEmbedding && testEmbedding.embedding && testEmbedding.embedding.length > 0 ? 'healthy' : 'unhealthy';

            return {
                name: 'embedding_service',
                status,
                responseTime,
                lastCheck: new Date(),
                details: {
                    embeddingDimensions: testEmbedding?.embedding?.length || 0,
                    provider: process.env.EMBEDDING_PROVIDER || 'unknown'
                }
            };
        } catch (error) {
            return {
                name: 'embedding_service',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                error: error instanceof Error ? error.message : 'Embedding service health check failed'
            };
        }
    }

    private async checkVectorSearchHealth(): Promise<ComponentHealth> {
        const startTime = Date.now();

        if (!this.vectorSearchEngine) {
            return {
                name: 'vector_search',
                status: 'degraded',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                details: {
                    message: 'Vector search engine not initialized'
                }
            };
        }

        try {
            // Test vector search with a simple query
            const searchResults = await this.vectorSearchEngine.semanticSearch('health check test', { topK: 1 });
            const responseTime = Date.now() - startTime;

            const status = Array.isArray(searchResults) ? 'healthy' : 'unhealthy';

            return {
                name: 'vector_search',
                status,
                responseTime,
                lastCheck: new Date(),
                details: {
                    searchResultsReturned: searchResults?.length || 0,
                    provider: process.env.VECTOR_DB_PROVIDER || 'unknown'
                }
            };
        } catch (error) {
            return {
                name: 'vector_search',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                error: error instanceof Error ? error.message : 'Vector search health check failed'
            };
        }
    }

    private async checkMonitoringHealth(): Promise<ComponentHealth> {
        const startTime = Date.now();

        if (!this.monitoringService) {
            return {
                name: 'monitoring',
                status: 'degraded',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                details: {
                    message: 'Monitoring service not initialized'
                }
            };
        }

        try {
            const metrics = await this.monitoringService.getPerformanceMetrics();
            const responseTime = Date.now() - startTime;

            // Consider monitoring healthy if it can provide metrics
            const status = metrics ? 'healthy' : 'unhealthy';

            return {
                name: 'monitoring',
                status,
                responseTime,
                lastCheck: new Date(),
                details: {
                    totalQueries: metrics?.totalQueries || 0,
                    averageResponseTime: metrics?.averageResponseTime || 0,
                    cacheHitRate: metrics?.cacheHitRate || 0
                }
            };
        } catch (error) {
            return {
                name: 'monitoring',
                status: 'unhealthy',
                responseTime: Date.now() - startTime,
                lastCheck: new Date(),
                error: error instanceof Error ? error.message : 'Monitoring health check failed'
            };
        }
    }

    private determineOverallStatus(components: ComponentHealth[]): 'healthy' | 'degraded' | 'unhealthy' {
        const unhealthyComponents = components.filter(c => c.status === 'unhealthy');
        const degradedComponents = components.filter(c => c.status === 'degraded');

        if (unhealthyComponents.length > 0) {
            // If critical components are unhealthy, system is unhealthy
            const criticalComponents = ['api', 'cache'];
            const criticalUnhealthy = unhealthyComponents.some(c => criticalComponents.includes(c.name));
            return criticalUnhealthy ? 'unhealthy' : 'degraded';
        }

        if (degradedComponents.length > 0) {
            return 'degraded';
        }

        return 'healthy';
    }

    private async handleComponentHealth(component: ComponentHealth): Promise<void> {
        const currentFailures = this.componentFailureCounts.get(component.name) || 0;

        if (component.status === 'unhealthy') {
            const newFailureCount = currentFailures + 1;
            this.componentFailureCounts.set(component.name, newFailureCount);

            // Trigger alert if consecutive failures exceed threshold
            if (newFailureCount >= this.config.alertThresholds.consecutiveFailures) {
                await this.triggerAlert({
                    component: component.name,
                    status: component.status,
                    consecutiveFailures: newFailureCount,
                    error: component.error,
                    responseTime: component.responseTime
                });
            }
        } else {
            // Reset failure count on successful health check
            this.componentFailureCounts.set(component.name, 0);
        }

        // Check response time threshold
        if (component.responseTime && component.responseTime > this.config.alertThresholds.responseTime) {
            await this.triggerAlert({
                component: component.name,
                status: 'slow_response',
                responseTime: component.responseTime,
                threshold: this.config.alertThresholds.responseTime
            });
        }
    }

    private async checkPerformanceDegradation(): Promise<void> {
        if (!this.monitoringService) return;

        try {
            const metrics = await this.monitoringService.getPerformanceMetrics();
            const systemMetrics = process.memoryUsage();
            const cpuUsage = process.cpuUsage();

            // Store historical metrics for trend analysis
            this.storeHistoricalMetrics({
                timestamp: Date.now(),
                responseTime: metrics.averageResponseTime,
                errorRate: metrics.totalQueries > 0 ? metrics.failedQueries / metrics.totalQueries : 0,
                memoryUsage: systemMetrics.heapUsed / systemMetrics.heapTotal,
                cacheHitRate: metrics.cacheHitRate,
                cpuUsage: cpuUsage.user / (cpuUsage.user + cpuUsage.system)
            });

            // Check error rate
            const errorRate = metrics.totalQueries > 0 ?
                metrics.failedQueries / metrics.totalQueries : 0;

            if (errorRate > this.config.alertThresholds.errorRate) {
                await this.triggerAlert({
                    component: 'system',
                    status: 'high_error_rate',
                    errorRate,
                    threshold: this.config.alertThresholds.errorRate,
                    totalQueries: metrics.totalQueries,
                    failedQueries: metrics.failedQueries,
                    severity: errorRate > this.config.alertThresholds.errorRate * 2 ? 'critical' : 'high'
                });
            }

            // Check average response time
            if (metrics.averageResponseTime > this.config.alertThresholds.responseTime) {
                await this.triggerAlert({
                    component: 'system',
                    status: 'slow_average_response',
                    averageResponseTime: metrics.averageResponseTime,
                    threshold: this.config.alertThresholds.responseTime,
                    p95ResponseTime: metrics.responseTimePercentiles.p95,
                    severity: metrics.averageResponseTime > this.config.alertThresholds.responseTime * 2 ? 'high' : 'medium'
                });
            }

            // Check memory usage
            const memoryUsageRatio = systemMetrics.heapUsed / systemMetrics.heapTotal;
            if (memoryUsageRatio > this.config.alertThresholds.memoryUsage) {
                await this.triggerAlert({
                    component: 'system',
                    status: 'high_memory_usage',
                    memoryUsage: memoryUsageRatio,
                    threshold: this.config.alertThresholds.memoryUsage,
                    heapUsed: systemMetrics.heapUsed,
                    heapTotal: systemMetrics.heapTotal,
                    severity: memoryUsageRatio > 0.95 ? 'critical' : 'high'
                });
            }

            // Check cache hit rate
            if (metrics.cacheHitRate < this.config.alertThresholds.cacheHitRate && metrics.totalQueries > 10) {
                await this.triggerAlert({
                    component: 'cache',
                    status: 'low_cache_hit_rate',
                    hitRate: metrics.cacheHitRate,
                    threshold: this.config.alertThresholds.cacheHitRate,
                    totalQueries: metrics.totalQueries,
                    severity: 'medium'
                });
            }

            // Check for performance trends
            const trends = this.analyzePerformanceTrends();
            if (trends.degradingResponseTime) {
                await this.triggerAlert({
                    component: 'system',
                    status: 'degrading_response_time',
                    currentAverage: trends.currentResponseTimeAvg,
                    previousAverage: trends.previousResponseTimeAvg,
                    percentageIncrease: trends.responseTimeTrend,
                    severity: 'medium'
                });
            }

            if (trends.increasingErrorRate) {
                await this.triggerAlert({
                    component: 'system',
                    status: 'increasing_error_rate',
                    currentRate: trends.currentErrorRateAvg,
                    previousRate: trends.previousErrorRateAvg,
                    percentageIncrease: trends.errorRateTrend,
                    severity: 'high'
                });
            }

        } catch (error) {
            console.error('Performance degradation check failed:', error);
        }
    }

    // Historical metrics for trend analysis
    private historicalMetrics: Array<{
        timestamp: number;
        responseTime: number;
        errorRate: number;
        memoryUsage: number;
        cacheHitRate: number;
        cpuUsage: number;
    }> = [];

    private storeHistoricalMetrics(metrics: {
        timestamp: number;
        responseTime: number;
        errorRate: number;
        memoryUsage: number;
        cacheHitRate: number;
        cpuUsage: number;
    }): void {
        this.historicalMetrics.push(metrics);

        // Keep only the last 24 hours of metrics
        const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
        this.historicalMetrics = this.historicalMetrics.filter(m => m.timestamp >= cutoffTime);
    }

    private analyzePerformanceTrends(): {
        degradingResponseTime: boolean;
        increasingErrorRate: boolean;
        responseTimeTrend: number;
        errorRateTrend: number;
        currentResponseTimeAvg: number;
        previousResponseTimeAvg: number;
        currentErrorRateAvg: number;
        previousErrorRateAvg: number;
    } {
        if (this.historicalMetrics.length < 10) {
            return {
                degradingResponseTime: false,
                increasingErrorRate: false,
                responseTimeTrend: 0,
                errorRateTrend: 0,
                currentResponseTimeAvg: 0,
                previousResponseTimeAvg: 0,
                currentErrorRateAvg: 0,
                previousErrorRateAvg: 0
            };
        }

        // Sort metrics by timestamp
        const sortedMetrics = [...this.historicalMetrics].sort((a, b) => a.timestamp - b.timestamp);

        // Split into two halves for comparison
        const midpoint = Math.floor(sortedMetrics.length / 2);
        const previousMetrics = sortedMetrics.slice(0, midpoint);
        const currentMetrics = sortedMetrics.slice(midpoint);

        // Calculate averages
        const previousResponseTimeAvg = previousMetrics.reduce((sum, m) => sum + m.responseTime, 0) / previousMetrics.length;
        const currentResponseTimeAvg = currentMetrics.reduce((sum, m) => sum + m.responseTime, 0) / currentMetrics.length;

        const previousErrorRateAvg = previousMetrics.reduce((sum, m) => sum + m.errorRate, 0) / previousMetrics.length;
        const currentErrorRateAvg = currentMetrics.reduce((sum, m) => sum + m.errorRate, 0) / currentMetrics.length;

        // Calculate trends (percentage change)
        const responseTimeTrend = previousResponseTimeAvg > 0 ?
            ((currentResponseTimeAvg - previousResponseTimeAvg) / previousResponseTimeAvg) * 100 : 0;

        const errorRateTrend = previousErrorRateAvg > 0 ?
            ((currentErrorRateAvg - previousErrorRateAvg) / previousErrorRateAvg) * 100 : 0;

        // Determine if trends indicate degradation
        // Consider it degrading if response time increased by 20% or more
        const degradingResponseTime = responseTimeTrend >= 20;

        // Consider it concerning if error rate increased by 50% or more
        const increasingErrorRate = errorRateTrend >= 50;

        return {
            degradingResponseTime,
            increasingErrorRate,
            responseTimeTrend,
            errorRateTrend,
            currentResponseTimeAvg,
            previousResponseTimeAvg,
            currentErrorRateAvg,
            previousErrorRateAvg
        };
    }

    private async triggerAlert(alertData: any): Promise<void> {
        const alert: Alert = {
            id: `health-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            metric: alertData.component,
            value: alertData.responseTime || alertData.errorRate || 0,
            threshold: alertData.threshold || 0,
            message: this.formatAlertMessage(alertData),
            timestamp: Date.now(),
            severity: this.determineSeverity(alertData)
        };

        // Emit alert event
        this.emit('alert', alert);

        // Log alert
        console.warn(`Health Check Alert: ${alert.message}`, {
            alertId: alert.id,
            component: alertData.component,
            severity: alert.severity,
            details: alertData
        });
    }

    private formatAlertMessage(alertData: any): string {
        switch (alertData.status) {
            case 'unhealthy':
                return `Component ${alertData.component} is unhealthy after ${alertData.consecutiveFailures} consecutive failures. Error: ${alertData.error || 'Unknown'}`;
            case 'slow_response':
                return `Component ${alertData.component} response time (${alertData.responseTime}ms) exceeds threshold (${alertData.threshold}ms)`;
            case 'high_error_rate':
                return `System error rate (${(alertData.errorRate * 100).toFixed(1)}%) exceeds threshold (${(alertData.threshold * 100).toFixed(1)}%). Failed queries: ${alertData.failedQueries}/${alertData.totalQueries}`;
            case 'slow_average_response':
                return `System average response time (${alertData.averageResponseTime}ms) exceeds threshold (${alertData.threshold}ms)`;
            default:
                return `Health check alert for ${alertData.component}: ${JSON.stringify(alertData)}`;
        }
    }

    private determineSeverity(alertData: any): 'low' | 'medium' | 'high' | 'critical' {
        if (alertData.status === 'unhealthy' && alertData.consecutiveFailures >= 5) {
            return 'critical';
        }
        if (alertData.status === 'unhealthy' || alertData.status === 'high_error_rate') {
            return 'high';
        }
        if (alertData.status === 'slow_response' || alertData.status === 'slow_average_response') {
            return 'medium';
        }
        return 'low';
    }

    public getLastHealthCheck(): Date {
        return this.lastHealthCheck;
    }

    public getComponentFailureCounts(): Map<string, number> {
        return new Map(this.componentFailureCounts);
    }

    public resetComponentFailureCount(componentName: string): void {
        this.componentFailureCounts.set(componentName, 0);
    }

    public async getPerformanceTrends(): Promise<{
        responseTime: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isDegrading: boolean;
        };
        errorRate: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isIncreasing: boolean;
        };
        memoryUsage: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isIncreasing: boolean;
        };
        cacheHitRate: {
            trend: number;
            currentAverage: number;
            previousAverage: number;
            isDecreasing: boolean;
        };
        dataPoints: number;
        timeRange: {
            start: Date;
            end: Date;
        };
    }> {
        const trends = this.analyzePerformanceTrends();

        // Calculate memory usage trends
        const memoryTrends = this.calculateMetricTrend(metric => metric.memoryUsage);

        // Calculate cache hit rate trends
        const cacheTrends = this.calculateMetricTrend(metric => metric.cacheHitRate);

        // Get time range of historical data
        const timeRange = {
            start: new Date(Math.min(...this.historicalMetrics.map(m => m.timestamp))),
            end: new Date(Math.max(...this.historicalMetrics.map(m => m.timestamp)))
        };

        return {
            responseTime: {
                trend: trends.responseTimeTrend,
                currentAverage: trends.currentResponseTimeAvg,
                previousAverage: trends.previousResponseTimeAvg,
                isDegrading: trends.degradingResponseTime
            },
            errorRate: {
                trend: trends.errorRateTrend,
                currentAverage: trends.currentErrorRateAvg,
                previousAverage: trends.previousErrorRateAvg,
                isIncreasing: trends.increasingErrorRate
            },
            memoryUsage: {
                trend: memoryTrends.trend,
                currentAverage: memoryTrends.currentAverage,
                previousAverage: memoryTrends.previousAverage,
                isIncreasing: memoryTrends.trend > 10 // 10% increase is concerning
            },
            cacheHitRate: {
                trend: cacheTrends.trend,
                currentAverage: cacheTrends.currentAverage,
                previousAverage: cacheTrends.previousAverage,
                isDecreasing: cacheTrends.trend < -10 // 10% decrease is concerning
            },
            dataPoints: this.historicalMetrics.length,
            timeRange
        };
    }

    private calculateMetricTrend(metricSelector: (metric: {
        timestamp: number;
        responseTime: number;
        errorRate: number;
        memoryUsage: number;
        cacheHitRate: number;
        cpuUsage: number;
    }) => number): {
        trend: number;
        currentAverage: number;
        previousAverage: number;
    } {
        if (this.historicalMetrics.length < 10) {
            return {
                trend: 0,
                currentAverage: 0,
                previousAverage: 0
            };
        }

        // Sort metrics by timestamp
        const sortedMetrics = [...this.historicalMetrics].sort((a, b) => a.timestamp - b.timestamp);

        // Split into two halves for comparison
        const midpoint = Math.floor(sortedMetrics.length / 2);
        const previousMetrics = sortedMetrics.slice(0, midpoint);
        const currentMetrics = sortedMetrics.slice(midpoint);

        // Calculate averages
        const previousAverage = previousMetrics.reduce((sum, m) => sum + metricSelector(m), 0) / previousMetrics.length;
        const currentAverage = currentMetrics.reduce((sum, m) => sum + metricSelector(m), 0) / currentMetrics.length;

        // Calculate trend (percentage change)
        const trend = previousAverage > 0 ?
            ((currentAverage - previousAverage) / previousAverage) * 100 : 0;

        return {
            trend,
            currentAverage,
            previousAverage
        };
    }

    public destroy(): void {
        this.stop();
        this.removeAllListeners();
    }
}