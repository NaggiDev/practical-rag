import fs from 'fs/promises';
import path from 'path';
import request from 'supertest';
import { ApiGateway } from '../../api/app';
import { DataSourceConfig } from '../../models/dataSource';
import { CacheManager } from '../../services/cache';
import { DataSourceManagerImpl } from '../../services/dataSourceManager';
import { QueryProcessor } from '../../services/queryProcessor';

describe('Data Source Failure Scenarios and Graceful Degradation', () => {
    let apiGateway: ApiGateway;
    let app: any;
    let dataSourceManager: DataSourceManagerImpl;
    let cacheManager: CacheManager;
    let queryProcessor: QueryProcessor;

    // Test data sources for failure scenarios
    const workingDataSource: DataSourceConfig = {
        id: 'working-source',
        name: 'Working Test Source',
        type: 'file',
        config: {
            filePath: path.join(__dirname, '../test-data'),
            fileTypes: ['txt']
        },
        enabled: true
    };

    const failingDataSource: DataSourceConfig = {
        id: 'failing-source',
        name: 'Failing Test Source',
        type: 'file',
        config: {
            filePath: '/nonexistent/path',
            fileTypes: ['txt']
        },
        enabled: true
    };

    const slowDataSource: DataSourceConfig = {
        id: 'slow-api-source',
        name: 'Slow API Source',
        type: 'api',
        config: {
            apiEndpoint: 'https://httpbin.org/delay/10', // 10 second delay
            method: 'GET',
            timeout: 5000 // 5 second timeout - will cause timeout
        },
        enabled: true
    };

    beforeAll(async () => {
        // Initialize API gateway for testing
        apiGateway = new ApiGateway(0);
        app = apiGateway.getApp();

        // Initialize services
        dataSourceManager = new DataSourceManagerImpl();
        cacheManager = new CacheManager({
            provider: 'memory',
            ttl: 300,
            maxSize: 1000
        });

        // Setup test data sources
        await setupFailureTestSources();
    });

    afterAll(async () => {
        if (cacheManager) {
            await cacheManager.disconnect();
        }
        if (dataSourceManager) {
            await dataSourceManager.cleanup();
        }
    });

    async function setupFailureTestSources() {
        // Add working source
        try {
            await dataSourceManager.addSource(workingDataSource);
            await dataSourceManager.syncSource(workingDataSource.id);
        } catch (error) {
            console.warn('Failed to setup working source:', error);
        }

        // Add failing source (will fail during sync)
        try {
            await dataSourceManager.addSource(failingDataSource);
            // Don't sync - it will fail
        } catch (error) {
            console.warn('Expected failure setting up failing source:', error);
        }

        // Wait for initial setup
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    describe('Single Data Source Failures', () => {
        it('should continue operating when one data source fails', async () => {
            // Verify system can still process queries despite failing source
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'test query with failing source' })
                .expect(200);

            // Verify response is still generated (Requirement 2.5)
            expect(response.body.result.response).toBeTruthy();
            expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);

            // System should indicate some sources failed but still return results
            expect(response.body.metadata.totalSources).toBeGreaterThanOrEqual(1);
        });

        it('should handle data source connection timeouts gracefully', async () => {
            // Add slow/timing out source
            try {
                await dataSourceManager.addSource(slowDataSource);
            } catch (error) {
                // Expected to fail or timeout
            }

            const startTime = Date.now();
            const response = await request(app)
                .post('/api/v1/query')
                .send({
                    text: 'timeout test query',
                    timeout: 3000 // 3 second query timeout
                })
                .expect(200);
            const endTime = Date.now();

            const responseTime = endTime - startTime;

            // Should not wait for slow source and should respond quickly
            expect(responseTime).toBeLessThan(5000); // Should not wait full 10 seconds
            expect(response.body.result.response).toBeTruthy();

            // Cleanup
            try {
                await dataSourceManager.removeSource(slowDataSource.id);
            } catch (error) {
                // Ignore cleanup errors
            }
        });

        it('should provide meaningful error information for failed sources', async () => {
            const healthResponse = await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            // Should report on data source health
            expect(healthResponse.body.components.dataSources).toBeDefined();

            // Should indicate which sources are failing
            const dataSources = healthResponse.body.components.dataSources;
            expect(dataSources).toHaveProperty('status');

            if (dataSources.failedSources) {
                expect(Array.isArray(dataSources.failedSources)).toBe(true);
            }
        });
    });

    describe('Multiple Data Source Failures', () => {
        it('should handle cascading data source failures', async () => {
            // Simulate multiple source failures by adding several failing sources
            const failingSources = [
                {
                    id: 'failing-source-1',
                    name: 'Failing Source 1',
                    type: 'file',
                    config: { filePath: '/nonexistent/path1' },
                    enabled: true
                },
                {
                    id: 'failing-source-2',
                    name: 'Failing Source 2',
                    type: 'api',
                    config: { apiEndpoint: 'https://nonexistent.domain.invalid' },
                    enabled: true
                }
            ];

            // Add failing sources
            for (const source of failingSources) {
                try {
                    await dataSourceManager.addSource(source);
                } catch (error) {
                    // Expected to fail
                }
            }

            // System should still respond despite multiple failures
            const response = await request(app)
                .post('/api/v1/query')
                .send({ text: 'cascading failure test' })
                .expect(200);

            expect(response.body.result.response).toBeTruthy();

            // Cleanup failing sources
            for (const source of failingSources) {
                try {
                    await dataSourceManager.removeSource(source.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should maintain service availability with partial source failures', async () => {
            // Test that service remains available even when most sources fail
            const queries = [
                'availability test query 1',
                'availability test query 2',
                'availability test query 3'
            ];

            const responses = await Promise.all(
                queries.map(query =>
                    request(app)
                        .post('/api/v1/query')
                        .send({ text: query })
                        .expect(200)
                )
            );

            // All queries should succeed despite source failures
            responses.forEach(response => {
                expect(response.body.result.response).toBeTruthy();
                expect(response.body.result.confidence).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Network and Connectivity Failures', () => {
        it('should handle network timeouts for API sources', async () => {
            const networkFailureSource = {
                id: 'network-failure-source',
                name: 'Network Failure Source',
                type: 'api',
                config: {
                    apiEndpoint: 'https://httpbin.org/delay/30', // Very long delay
                    method: 'GET',
                    timeout: 2000 // 2 second timeout
                },
                enabled: true
            };

            try {
                await dataSourceManager.addSource(networkFailureSource);

                // Query should still work despite network timeout
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'network timeout test' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

            } finally {
                try {
                    await dataSourceManager.removeSource(networkFailureSource.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should handle DNS resolution failures', async () => {
            const dnsFailureSource = {
                id: 'dns-failure-source',
                name: 'DNS Failure Source',
                type: 'api',
                config: {
                    apiEndpoint: 'https://this-domain-does-not-exist-12345.invalid',
                    method: 'GET'
                },
                enabled: true
            };

            try {
                await dataSourceManager.addSource(dnsFailureSource);

                // System should handle DNS failures gracefully
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'dns failure test' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

            } finally {
                try {
                    await dataSourceManager.removeSource(dnsFailureSource.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });
    });

    describe('Data Corruption and Invalid Content', () => {
        it('should handle corrupted file sources', async () => {
            // Create a corrupted test file
            const corruptedFilePath = path.join(__dirname, '../test-data/corrupted-test.txt');
            const corruptedContent = '\x00\x01\x02\xFF\xFE\xFD'; // Binary garbage

            try {
                await fs.writeFile(corruptedFilePath, corruptedContent);

                const corruptedSource = {
                    id: 'corrupted-source',
                    name: 'Corrupted Source',
                    type: 'file',
                    config: {
                        filePath: path.dirname(corruptedFilePath),
                        fileTypes: ['txt']
                    },
                    enabled: true
                };

                await dataSourceManager.addSource(corruptedSource);

                // System should handle corrupted content gracefully
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'corrupted content test' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

                // Cleanup
                await dataSourceManager.removeSource(corruptedSource.id);

            } finally {
                try {
                    await fs.unlink(corruptedFilePath);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should handle malformed API responses', async () => {
            const malformedApiSource = {
                id: 'malformed-api-source',
                name: 'Malformed API Source',
                type: 'api',
                config: {
                    apiEndpoint: 'https://httpbin.org/html', // Returns HTML instead of JSON
                    method: 'GET',
                    responseMapping: {
                        titleField: 'title',
                        contentField: 'content' // These fields won't exist in HTML
                    }
                },
                enabled: true
            };

            try {
                await dataSourceManager.addSource(malformedApiSource);

                // System should handle malformed responses gracefully
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'malformed response test' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

            } finally {
                try {
                    await dataSourceManager.removeSource(malformedApiSource.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });
    });

    describe('Resource Exhaustion Scenarios', () => {
        it('should handle memory pressure from large data sources', async () => {
            // Create a large test file
            const largeFilePath = path.join(__dirname, '../test-data/large-test.txt');
            const largeContent = 'Large content line.\n'.repeat(10000); // ~200KB file

            try {
                await fs.writeFile(largeFilePath, largeContent);

                const largeSource = {
                    id: 'large-source',
                    name: 'Large Source',
                    type: 'file',
                    config: {
                        filePath: path.dirname(largeFilePath),
                        fileTypes: ['txt']
                    },
                    enabled: true
                };

                await dataSourceManager.addSource(largeSource);
                await dataSourceManager.syncSource(largeSource.id);

                // System should handle large sources without crashing
                const response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'large content test' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

                // Cleanup
                await dataSourceManager.removeSource(largeSource.id);

            } finally {
                try {
                    await fs.unlink(largeFilePath);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should handle disk space issues gracefully', async () => {
            // This test simulates disk space issues by trying to create very large cache entries
            const queries = Array.from({ length: 50 }, (_, i) =>
                `disk space test query ${i} with lots of additional context data`
            );

            // Generate many queries to potentially fill up cache/disk
            const responses = await Promise.all(
                queries.map(query =>
                    request(app)
                        .post('/api/v1/query')
                        .send({
                            text: query,
                            context: { largeData: 'x'.repeat(1000) } // 1KB per query
                        })
                        .timeout(10000)
                        .catch(err => ({ error: err }))
                )
            );

            const successfulResponses = responses.filter(r => !r.error && r.status === 200);
            const successRate = successfulResponses.length / responses.length;

            // System should handle resource pressure gracefully
            expect(successRate).toBeGreaterThan(0.7); // At least 70% success rate
        });
    });

    describe('Recovery and Resilience', () => {
        it('should recover from temporary data source failures', async () => {
            // Create a temporary file that we'll delete and recreate
            const tempFilePath = path.join(__dirname, '../test-data/temp-recovery-test.txt');
            const tempContent = 'Temporary recovery test content';

            try {
                // Create file and source
                await fs.writeFile(tempFilePath, tempContent);

                const tempSource = {
                    id: 'temp-recovery-source',
                    name: 'Temporary Recovery Source',
                    type: 'file',
                    config: {
                        filePath: path.dirname(tempFilePath),
                        fileTypes: ['txt']
                    },
                    enabled: true
                };

                await dataSourceManager.addSource(tempSource);
                await dataSourceManager.syncSource(tempSource.id);

                // Verify source works initially
                let response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'recovery test content' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

                // Delete file to simulate failure
                await fs.unlink(tempFilePath);

                // System should still work despite missing file
                response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'recovery test during failure' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

                // Recreate file to simulate recovery
                await fs.writeFile(tempFilePath, tempContent + ' - recovered');
                await dataSourceManager.syncSource(tempSource.id);

                // System should recover and work normally
                response = await request(app)
                    .post('/api/v1/query')
                    .send({ text: 'recovery test after recovery' })
                    .expect(200);

                expect(response.body.result.response).toBeTruthy();

                // Cleanup
                await dataSourceManager.removeSource(tempSource.id);

            } finally {
                try {
                    await fs.unlink(tempFilePath);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should maintain query quality despite source failures', async () => {
            // Test that query quality doesn't degrade significantly with source failures
            const testQuery = 'quality maintenance test';

            // Get baseline quality with all sources working
            const baselineResponse = await request(app)
                .post('/api/v1/query')
                .send({ text: testQuery })
                .expect(200);

            const baselineConfidence = baselineResponse.body.result.confidence;

            // Add a failing source
            const additionalFailingSource = {
                id: 'additional-failing-source',
                name: 'Additional Failing Source',
                type: 'file',
                config: { filePath: '/another/nonexistent/path' },
                enabled: true
            };

            try {
                await dataSourceManager.addSource(additionalFailingSource);

                // Test quality with failing source
                const degradedResponse = await request(app)
                    .post('/api/v1/query')
                    .send({ text: testQuery })
                    .expect(200);

                const degradedConfidence = degradedResponse.body.result.confidence;

                // Quality should not degrade significantly
                expect(degradedResponse.body.result.response).toBeTruthy();
                expect(degradedConfidence).toBeGreaterThanOrEqual(baselineConfidence * 0.8); // Max 20% degradation

            } finally {
                try {
                    await dataSourceManager.removeSource(additionalFailingSource.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });

        it('should provide circuit breaker functionality for failing sources', async () => {
            // Add a consistently failing source
            const circuitBreakerSource = {
                id: 'circuit-breaker-source',
                name: 'Circuit Breaker Source',
                type: 'api',
                config: {
                    apiEndpoint: 'https://httpbin.org/status/500', // Always returns 500 error
                    method: 'GET'
                },
                enabled: true
            };

            try {
                await dataSourceManager.addSource(circuitBreakerSource);

                // Make multiple queries to trigger circuit breaker
                const queries = Array.from({ length: 10 }, (_, i) =>
                    `circuit breaker test ${i}`
                );

                const startTime = Date.now();
                const responses = await Promise.all(
                    queries.map(query =>
                        request(app)
                            .post('/api/v1/query')
                            .send({ text: query })
                            .expect(200)
                    )
                );
                const endTime = Date.now();

                const totalTime = endTime - startTime;
                const avgResponseTime = totalTime / queries.length;

                // Later queries should be faster due to circuit breaker
                expect(avgResponseTime).toBeLessThan(2000); // Should not wait for failing source

                // All queries should still succeed
                responses.forEach(response => {
                    expect(response.body.result.response).toBeTruthy();
                });

            } finally {
                try {
                    await dataSourceManager.removeSource(circuitBreakerSource.id);
                } catch (error) {
                    // Ignore cleanup errors
                }
            }
        });
    });

    describe('Error Reporting and Monitoring', () => {
        it('should log and track data source failures', async () => {
            const healthResponse = await request(app)
                .get('/api/v1/health/detailed')
                .expect(200);

            // Should provide detailed information about source failures
            expect(healthResponse.body.components.dataSources).toBeDefined();

            const dataSources = healthResponse.body.components.dataSources;
            expect(dataSources).toHaveProperty('status');

            // Should track error metrics
            if (dataSources.errorMetrics) {
                expect(dataSources.errorMetrics).toHaveProperty('totalErrors');
                expect(dataSources.errorMetrics).toHaveProperty('errorRate');
            }
        });

        it('should provide failure diagnostics', async () => {
            const diagnosticsResponse = await request(app)
                .get('/api/v1/health/diagnostics')
                .expect(200);

            // Should provide diagnostic information
            expect(diagnosticsResponse.body).toHaveProperty('timestamp');
            expect(diagnosticsResponse.body).toHaveProperty('systemStatus');

            if (diagnosticsResponse.body.failures) {
                expect(Array.isArray(diagnosticsResponse.body.failures)).toBe(true);
            }
        });
    });
});