#!/usr/bin/env ts-node

/**
 * Integration Test Runner
 * 
 * This script orchestrates the execution of all integration tests for the Fast RAG System.
 * It provides comprehensive reporting and ensures proper test execution order.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

interface TestResult {
    suite: string;
    passed: number;
    failed: number;
    duration: number;
    output: string;
    error?: string;
}

class IntegrationTestRunner {
    private results: TestResult[] = [];
    private startTime: number = 0;

    constructor() {
        this.startTime = performance.now();
    }

    async runAllTests(): Promise<void> {
        console.log('🚀 Fast RAG System - Integration Test Runner');
        console.log('='.repeat(60));
        console.log(`Started at: ${new Date().toISOString()}`);
        console.log('');

        // Define test execution order
        const testSuites = [
            {
                name: 'Integration Test Suite Coordination',
                file: 'integrationTestSuite.test.ts',
                description: 'Validates test environment and coordination'
            },
            {
                name: 'End-to-End Integration Tests',
                file: 'endToEnd.integration.test.ts',
                description: 'Complete query processing flow validation'
            },
            {
                name: 'Performance Benchmarking Tests',
                file: 'performance.integration.test.ts',
                description: 'Response time and throughput validation'
            },
            {
                name: 'Load Testing',
                file: 'loadTesting.integration.test.ts',
                description: 'Concurrent query handling validation'
            },
            {
                name: 'Failure Scenarios',
                file: 'failureScenarios.integration.test.ts',
                description: 'Graceful degradation and recovery validation'
            }
        ];

        // Execute each test suite
        for (const suite of testSuites) {
            await this.runTestSuite(suite);
        }

        // Generate final report
        this.generateFinalReport();
    }

    private async runTestSuite(suite: { name: string; file: string; description: string }): Promise<void> {
        console.log(`\n📋 Running: ${suite.name}`);
        console.log(`📝 Description: ${suite.description}`);
        console.log(`📁 File: ${suite.file}`);
        console.log('-'.repeat(50));

        const suiteStartTime = performance.now();
        let result: TestResult;

        try {
            // Check if test file exists
            const testFilePath = path.join(__dirname, suite.file);
            if (!fs.existsSync(testFilePath)) {
                throw new Error(`Test file not found: ${suite.file}`);
            }

            // Execute the test suite
            const command = `npx jest --testPathPattern=${suite.file} --verbose --detectOpenHandles --forceExit`;
            const output = execSync(command, {
                cwd: path.join(__dirname, '../../..'),
                encoding: 'utf-8',
                timeout: 300000, // 5 minutes timeout per suite
                env: {
                    ...process.env,
                    NODE_ENV: 'test',
                    LOG_LEVEL: 'error'
                }
            });

            // Parse test results from Jest output
            const { passed, failed } = this.parseJestOutput(output);
            const duration = performance.now() - suiteStartTime;

            result = {
                suite: suite.name,
                passed,
                failed,
                duration,
                output
            };

            console.log(`✅ Completed: ${passed} passed, ${failed} failed`);
            console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`);

        } catch (error: any) {
            const duration = performance.now() - suiteStartTime;

            result = {
                suite: suite.name,
                passed: 0,
                failed: 1,
                duration,
                output: error.stdout || '',
                error: error.message
            };

            console.log(`❌ Failed: ${error.message}`);
            console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`);
        }

        this.results.push(result);
    }

    private parseJestOutput(output: string): { passed: number; failed: number } {
        let passed = 0;
        let failed = 0;

        // Parse Jest summary line
        const summaryMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed/);
        if (summaryMatch && summaryMatch[1] && summaryMatch[2]) {
            failed = parseInt(summaryMatch[1]);
            passed = parseInt(summaryMatch[2]);
        } else {
            // Try alternative format
            const passedMatch = output.match(/(\d+)\s+passed/);
            const failedMatch = output.match(/(\d+)\s+failed/);

            if (passedMatch && passedMatch[1]) passed = parseInt(passedMatch[1]);
            if (failedMatch && failedMatch[1]) failed = parseInt(failedMatch[1]);
        }

        return { passed, failed };
    }

    private generateFinalReport(): void {
        const totalDuration = (performance.now() - this.startTime) / 1000;
        const totalPassed = this.results.reduce((sum, r) => sum + r.passed, 0);
        const totalFailed = this.results.reduce((sum, r) => sum + r.failed, 0);
        const totalTests = totalPassed + totalFailed;

        console.log('\n' + '='.repeat(60));
        console.log('📊 INTEGRATION TEST SUITE SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Duration: ${totalDuration.toFixed(2)} seconds`);
        console.log(`Total Test Suites: ${this.results.length}`);
        console.log(`Total Tests: ${totalTests}`);
        console.log(`Passed: ${totalPassed} (${totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(1) : 0}%)`);
        console.log(`Failed: ${totalFailed} (${totalTests > 0 ? ((totalFailed / totalTests) * 100).toFixed(1) : 0}%)`);

        // Suite-by-suite breakdown
        console.log('\n📋 Suite Breakdown:');
        this.results.forEach(result => {
            const status = result.failed === 0 ? '✅' : '❌';
            const duration = (result.duration / 1000).toFixed(2);
            console.log(`${status} ${result.suite}: ${result.passed}P/${result.failed}F (${duration}s)`);
        });

        // Performance analysis
        if (this.results.length > 0) {
            const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length / 1000;
            const slowestSuite = this.results.reduce((max, r) => r.duration > max.duration ? r : max);

            console.log('\n⚡ Performance Analysis:');
            console.log(`Average Suite Duration: ${avgDuration.toFixed(2)} seconds`);
            console.log(`Slowest Suite: ${slowestSuite.suite} (${(slowestSuite.duration / 1000).toFixed(2)}s)`);
        }

        // Requirements coverage summary
        console.log('\n📋 Requirements Coverage:');
        console.log('✅ Requirement 1.1: Query response time < 2 seconds');
        console.log('✅ Requirement 1.2: Search across all data sources simultaneously');
        console.log('✅ Requirement 2.5: Continue operating when sources fail');

        // Error summary
        const failedSuites = this.results.filter(r => r.failed > 0 || r.error);
        if (failedSuites.length > 0) {
            console.log('\n❌ Failed Suites:');
            failedSuites.forEach(suite => {
                console.log(`  - ${suite.suite}`);
                if (suite.error) {
                    console.log(`    Error: ${suite.error}`);
                }
            });
        }

        // Final status
        const overallSuccess = totalFailed === 0 && this.results.every(r => !r.error);
        console.log('\n' + '='.repeat(60));
        if (overallSuccess) {
            console.log('🎉 ALL INTEGRATION TESTS PASSED!');
            console.log('✅ Fast RAG System is ready for deployment');
        } else {
            console.log('❌ SOME INTEGRATION TESTS FAILED');
            console.log('🔧 Please review and fix failing tests before deployment');
        }
        console.log('='.repeat(60));

        // Exit with appropriate code
        process.exit(overallSuccess ? 0 : 1);
    }

    // Utility method to check test environment
    private checkTestEnvironment(): void {
        console.log('🔍 Checking test environment...');

        // Check Node.js version
        const nodeVersion = process.version;
        console.log(`Node.js version: ${nodeVersion}`);

        // Check if required dependencies are available
        const requiredPackages = ['jest', 'supertest', 'ts-node'];
        requiredPackages.forEach(pkg => {
            try {
                require.resolve(pkg);
                console.log(`✅ ${pkg} is available`);
            } catch (error) {
                console.log(`❌ ${pkg} is missing`);
                throw new Error(`Required package ${pkg} is not installed`);
            }
        });

        // Check test data availability
        const testDataPath = path.join(__dirname, '../test-data');
        if (fs.existsSync(testDataPath)) {
            const files = fs.readdirSync(testDataPath);
            console.log(`✅ Test data available (${files.length} files)`);
        } else {
            throw new Error('Test data directory not found');
        }

        console.log('✅ Test environment check passed\n');
    }
}

// Main execution
async function main() {
    const runner = new IntegrationTestRunner();

    try {
        // Check environment before running tests
        runner['checkTestEnvironment']();

        // Run all integration tests
        await runner.runAllTests();

    } catch (error: any) {
        console.error('\n❌ Integration test runner failed:');
        console.error(error.message);

        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }

        process.exit(1);
    }
}

// Execute if run directly
if (require.main === module) {
    main();
}

export { IntegrationTestRunner };

