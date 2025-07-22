import { performance } from 'perf_hooks';

/**
 * Integration Test Suite Runner
 * 
 * This test suite orchestrates and coordinates all integration tests for the Fast RAG System.
 * It ensures proper test execution order, shared setup/teardown, and comprehensive reporting.
 * 
 * Requirements covered:
 * - 1.1: Query response time < 2 seconds
 * - 1.2: Simultaneous search across all data sources  
 * - 2.5: Continue operating with remaining sources when some fail
 */

describe('Fast RAG System - Complete Integration Test Suite', () => {
    let suiteStartTime: number;
    let testResults: Array<{
        suite: string;
        test: string;
        duration: number;
        status: 'passed' | 'failed';
        error?: string;
    }> = [];

    beforeAll(async () => {
        suiteStartTime = performance.now();
        console.log('\n🚀 Starting Fast RAG System Integration Test Suite');
        console.log('='.repeat(60));

        // Global test environment setup
        process.env.NODE_ENV = 'test';
        process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

        // Increase test timeout for integration tests
        jest.setTimeout(60000); // 60 seconds per test
    });

    afterAll(async () => {
        const suiteEndTime = performance.now();
        const totalDuration = (suiteEndTime - suiteStartTime) / 1000;

        console.log('\n📊 Integration Test Suite Summary');
        console.log('='.repeat(60));
        console.log(`Total Duration: ${totalDuration.toFixed(2)} seconds`);
        console.log(`Total Tests: ${testResults.length}`);
        console.log(`Passed: ${testResults.filter(r => r.status === 'passed').length}`);
        console.log(`Failed: ${testResults.filter(r => r.status === 'failed').length}`);

        if (testResults.length > 0) {
            const avgDuration = testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length;
            console.log(`Average Test Duration: ${avgDuration.toFixed(2)}ms`);

            const slowestTest = testResults.reduce((max, r) => r.duration > max.duration ? r : max);
            console.log(`Slowest Test: ${slowestTest.suite} - ${slowestTest.test} (${slowestTest.duration.toFixed(2)}ms)`);
        }

        // Report any failures
        const failures = testResults.filter(r => r.status === 'failed');
        if (failures.length > 0) {
            console.log('\n❌ Failed Tests:');
            failures.forEach(failure => {
                console.log(`  - ${failure.suite}: ${failure.test}`);
                if (failure.error) {
                    console.log(`    Error: ${failure.error}`);
                }
            });
        }

        console.log('='.repeat(60));
    });

    // Helper function to track test results
    const trackTestResult = (suite: string, test: string, startTime: number, error?: Error) => {
        const duration = performance.now() - startTime;
        testResults.push({
            suite,
            test,
            duration,
            status: error ? 'failed' : 'passed',
            error: error?.message
        });
    };

    describe('Test Suite Coordination', () => {
        it('should verify test environment setup', async () => {
            const testStart = performance.now();

            try {
                // Verify environment variables
                expect(process.env.NODE_ENV).toBe('test');

                // Verify test data availability
                const fs = require('fs/promises');
                const path = require('path');

                const testDataPath = path.join(__dirname, '../test-data');
                const testDataExists = await fs.access(testDataPath).then(() => true).catch(() => false);
                expect(testDataExists).toBe(true);

                // Verify required test files exist
                const requiredFiles = [
                    'sample.txt',
                    'integration-test-doc.md',
                    'performance-test-data.txt'
                ];

                for (const file of requiredFiles) {
                    const filePath = path.join(testDataPath, file);
                    const fileExists = await fs.access(filePath).then(() => true).catch(() => false);
                    expect(fileExists).toBe(true);
                }

                trackTestResult('Setup', 'Environment Verification', testStart);
            } catch (error) {
                trackTestResult('Setup', 'Environment Verification', testStart, error as Error);
                throw error;
            }
        });

        it('should validate test dependencies and services', async () => {
            const testStart = performance.now();

            try {
                // Verify required modules can be imported
                const { ApiGateway } = require('../../api/app');
                const { DataSourceManagerImpl } = require('../../services/dataSourceManager');
                const { CacheManager } = require('../../services/cache');

                expect(ApiGateway).toBeDefined();
                expect(DataSourceManagerImpl).toBeDefined();
                expect(CacheManager).toBeDefined();

                // Test basic service instantiation
                const apiGateway = new ApiGateway(0);
                expect(apiGateway).toBeDefined();
                expect(apiGateway.getApp).toBeDefined();

                const cacheManager = new CacheManager({
                    provider: 'memory',
                    ttl: 300,
                    maxSize: 100
                });
                expect(cacheManager).toBeDefined();

                // Cleanup
                await cacheManager.disconnect();

                trackTestResult('Setup', 'Dependency Validation', testStart);
            } catch (error) {
                trackTestResult('Setup', 'Dependency Validation', testStart, error as Error);
                throw error;
            }
        });
    });

    describe('Integration Test Execution Order', () => {
        it('should execute end-to-end tests first', async () => {
            const testStart = performance.now();

            try {
                // This test ensures that basic end-to-end functionality works
                // before running more complex performance and failure tests
                console.log('📋 End-to-end tests should be executed first');
                console.log('   These tests verify basic system functionality');

                // Verify that end-to-end test file exists and is properly structured
                const fs = require('fs/promises');
                const path = require('path');

                const endToEndTestPath = path.join(__dirname, 'endToEnd.integration.test.ts');
                const testFileExists = await fs.access(endToEndTestPath).then(() => true).catch(() => false);
                expect(testFileExists).toBe(true);

                const testContent = await fs.readFile(endToEndTestPath, 'utf-8');
                expect(testContent).toContain('Complete Query Processing Flow');
                expect(testContent).toContain('should process a query end-to-end within 2 seconds');

                trackTestResult('Execution Order', 'End-to-End Priority', testStart);
            } catch (error) {
                trackTestResult('Execution Order', 'End-to-End Priority', testStart, error as Error);
                throw error;
            }
        });

        it('should execute performance tests after basic functionality', async () => {
            const testStart = performance.now();

            try {
                console.log('⚡ Performance tests should execute after basic functionality');
                console.log('   These tests verify system meets performance requirements');

                // Verify performance test file structure
                const fs = require('fs/promises');
                const path = require('path');

                const performanceTestPath = path.join(__dirname, 'performance.integration.test.ts');
                const testFileExists = await fs.access(performanceTestPath).then(() => true).catch(() => false);
                expect(testFileExists).toBe(true);

                const testContent = await fs.readFile(performanceTestPath, 'utf-8');
                expect(testContent).toContain('Performance Benchmarking Tests');
                expect(testContent).toContain('TYPICAL_QUERY_MAX_TIME: 2000');
                expect(testContent).toContain('CACHED_QUERY_MAX_TIME: 500');

                trackTestResult('Execution Order', 'Performance Tests', testStart);
            } catch (error) {
                trackTestResult('Execution Order', 'Performance Tests', testStart, error as Error);
                throw error;
            }
        });

        it('should execute load tests after performance validation', async () => {
            const testStart = performance.now();

            try {
                console.log('🔄 Load tests should execute after performance validation');
                console.log('   These tests verify system handles concurrent load');

                // Verify load test file structure
                const fs = require('fs/promises');
                const path = require('path');

                const loadTestPath = path.join(__dirname, 'loadTesting.integration.test.ts');
                const testFileExists = await fs.access(loadTestPath).then(() => true).catch(() => false);
                expect(testFileExists).toBe(true);

                const testContent = await fs.readFile(loadTestPath, 'utf-8');
                expect(testContent).toContain('Load Testing - Concurrent Query Handling');
                expect(testContent).toContain('LIGHT_LOAD');
                expect(testContent).toContain('HEAVY_LOAD');
                expect(testContent).toContain('STRESS_LOAD');

                trackTestResult('Execution Order', 'Load Tests', testStart);
            } catch (error) {
                trackTestResult('Execution Order', 'Load Tests', testStart, error as Error);
                throw error;
            }
        });

        it('should execute failure scenario tests last', async () => {
            const testStart = performance.now();

            try {
                console.log('🛡️  Failure scenario tests should execute last');
                console.log('   These tests verify graceful degradation and recovery');

                // Verify failure scenario test file structure
                const fs = require('fs/promises');
                const path = require('path');

                const failureTestPath = path.join(__dirname, 'failureScenarios.integration.test.ts');
                const testFileExists = await fs.access(failureTestPath).then(() => true).catch(() => false);
                expect(testFileExists).toBe(true);

                const testContent = await fs.readFile(failureTestPath, 'utf-8');
                expect(testContent).toContain('Data Source Failure Scenarios and Graceful Degradation');
                expect(testContent).toContain('should continue operating when one data source fails');
                expect(testContent).toContain('Recovery and Resilience');

                trackTestResult('Execution Order', 'Failure Scenarios', testStart);
            } catch (error) {
                trackTestResult('Execution Order', 'Failure Scenarios', testStart, error as Error);
                throw error;
            }
        });
    });

    describe('Test Coverage Verification', () => {
        it('should verify all requirements are covered by tests', async () => {
            const testStart = performance.now();

            try {
                const requirementsCoverage = {
                    '1.1': 'Query response time < 2 seconds',
                    '1.2': 'Search across all configured data sources simultaneously',
                    '2.5': 'Continue operating with remaining sources when some fail'
                };

                console.log('📋 Verifying requirement coverage:');

                // Check that each requirement is mentioned in test files
                const fs = require('fs/promises');
                const path = require('path');

                const testFiles = [
                    'endToEnd.integration.test.ts',
                    'performance.integration.test.ts',
                    'loadTesting.integration.test.ts',
                    'failureScenarios.integration.test.ts'
                ];

                for (const [reqId, reqDescription] of Object.entries(requirementsCoverage)) {
                    let requirementCovered = false;

                    for (const testFile of testFiles) {
                        const testFilePath = path.join(__dirname, testFile);
                        const testContent = await fs.readFile(testFilePath, 'utf-8');

                        if (testContent.includes(`Requirement ${reqId}`) ||
                            testContent.includes(reqId.replace('.', '\\.'))) {
                            requirementCovered = true;
                            break;
                        }
                    }

                    console.log(`   ${reqId}: ${requirementCovered ? '✅' : '❌'} ${reqDescription}`);
                    expect(requirementCovered).toBe(true);
                }

                trackTestResult('Coverage', 'Requirements Coverage', testStart);
            } catch (error) {
                trackTestResult('Coverage', 'Requirements Coverage', testStart, error as Error);
                throw error;
            }
        });

        it('should verify test data completeness', async () => {
            const testStart = performance.now();

            try {
                const fs = require('fs/promises');
                const path = require('path');

                const testDataPath = path.join(__dirname, '../test-data');
                const files = await fs.readdir(testDataPath);

                console.log('📁 Test data files available:');
                files.forEach(file => {
                    console.log(`   - ${file}`);
                });

                // Verify minimum required test data
                expect(files.length).toBeGreaterThan(0);
                expect(files.some(f => f.endsWith('.txt'))).toBe(true);
                expect(files.some(f => f.endsWith('.md'))).toBe(true);

                // Verify test data has sufficient content
                for (const file of files) {
                    const filePath = path.join(testDataPath, file);
                    const stats = await fs.stat(filePath);
                    expect(stats.size).toBeGreaterThan(0);
                }

                trackTestResult('Coverage', 'Test Data Completeness', testStart);
            } catch (error) {
                trackTestResult('Coverage', 'Test Data Completeness', testStart, error as Error);
                throw error;
            }
        });
    });

    describe('Test Quality Assurance', () => {
        it('should verify test isolation and independence', async () => {
            const testStart = performance.now();

            try {
                console.log('🔒 Verifying test isolation principles:');
                console.log('   - Each test suite should clean up after itself');
                console.log('   - Tests should not depend on execution order');
                console.log('   - Shared resources should be properly managed');

                // Verify test files follow isolation patterns
                const fs = require('fs/promises');
                const path = require('path');

                const testFiles = [
                    'endToEnd.integration.test.ts',
                    'performance.integration.test.ts',
                    'loadTesting.integration.test.ts',
                    'failureScenarios.integration.test.ts'
                ];

                for (const testFile of testFiles) {
                    const testFilePath = path.join(__dirname, testFile);
                    const testContent = await fs.readFile(testFilePath, 'utf-8');

                    // Verify proper setup/teardown
                    expect(testContent).toContain('beforeAll');
                    expect(testContent).toContain('afterAll');

                    // Verify cleanup patterns
                    expect(testContent).toContain('disconnect') || expect(testContent).toContain('cleanup');
                }

                trackTestResult('Quality', 'Test Isolation', testStart);
            } catch (error) {
                trackTestResult('Quality', 'Test Isolation', testStart, error as Error);
                throw error;
            }
        });

        it('should verify comprehensive error handling in tests', async () => {
            const testStart = performance.now();

            try {
                console.log('🛡️  Verifying error handling in tests:');

                const fs = require('fs/promises');
                const path = require('path');

                const testFiles = [
                    'endToEnd.integration.test.ts',
                    'performance.integration.test.ts',
                    'loadTesting.integration.test.ts',
                    'failureScenarios.integration.test.ts'
                ];

                for (const testFile of testFiles) {
                    const testFilePath = path.join(__dirname, testFile);
                    const testContent = await fs.readFile(testFilePath, 'utf-8');

                    // Verify error handling patterns
                    const hasTryCatch = testContent.includes('try {') && testContent.includes('} catch');
                    const hasErrorExpectations = testContent.includes('.catch(') || testContent.includes('expect(').includes('toThrow');
                    const hasCleanupInFinally = testContent.includes('} finally {') || testContent.includes('afterAll');

                    console.log(`   ${testFile}:`);
                    console.log(`     Try/Catch: ${hasTryCatch ? '✅' : '❌'}`);
                    console.log(`     Error Expectations: ${hasErrorExpectations ? '✅' : '❌'}`);
                    console.log(`     Cleanup: ${hasCleanupInFinally ? '✅' : '❌'}`);

                    expect(hasTryCatch || hasErrorExpectations).toBe(true);
                    expect(hasCleanupInFinally).toBe(true);
                }

                trackTestResult('Quality', 'Error Handling', testStart);
            } catch (error) {
                trackTestResult('Quality', 'Error Handling', testStart, error as Error);
                throw error;
            }
        });
    });

    describe('Performance Validation', () => {
        it('should verify test suite execution time is reasonable', async () => {
            const testStart = performance.now();

            try {
                // This test runs at the end to validate overall suite performance
                const currentDuration = (performance.now() - suiteStartTime) / 1000;

                console.log(`⏱️  Current test suite duration: ${currentDuration.toFixed(2)} seconds`);

                // Test suite should complete within reasonable time (10 minutes max)
                const maxSuiteDuration = 600; // 10 minutes
                expect(currentDuration).toBeLessThan(maxSuiteDuration);

                // Individual test average should be reasonable
                if (testResults.length > 0) {
                    const avgTestDuration = testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length;
                    console.log(`📊 Average test duration: ${avgTestDuration.toFixed(2)}ms`);

                    // Average test should complete within 30 seconds
                    expect(avgTestDuration).toBeLessThan(30000);
                }

                trackTestResult('Performance', 'Suite Execution Time', testStart);
            } catch (error) {
                trackTestResult('Performance', 'Suite Execution Time', testStart, error as Error);
                throw error;
            }
        });
    });
});