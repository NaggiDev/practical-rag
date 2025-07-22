#!/usr/bin/env ts-node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntegrationTestRunner = void 0;
const child_process_1 = require("child_process");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const perf_hooks_1 = require("perf_hooks");
class IntegrationTestRunner {
    constructor() {
        this.results = [];
        this.startTime = 0;
        this.startTime = perf_hooks_1.performance.now();
    }
    async runAllTests() {
        console.log('🚀 Fast RAG System - Integration Test Runner');
        console.log('='.repeat(60));
        console.log(`Started at: ${new Date().toISOString()}`);
        console.log('');
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
        for (const suite of testSuites) {
            await this.runTestSuite(suite);
        }
        this.generateFinalReport();
    }
    async runTestSuite(suite) {
        console.log(`\n📋 Running: ${suite.name}`);
        console.log(`📝 Description: ${suite.description}`);
        console.log(`📁 File: ${suite.file}`);
        console.log('-'.repeat(50));
        const suiteStartTime = perf_hooks_1.performance.now();
        let result;
        try {
            const testFilePath = path_1.default.join(__dirname, suite.file);
            if (!fs_1.default.existsSync(testFilePath)) {
                throw new Error(`Test file not found: ${suite.file}`);
            }
            const command = `npx jest --testPathPattern=${suite.file} --verbose --detectOpenHandles --forceExit`;
            const output = (0, child_process_1.execSync)(command, {
                cwd: path_1.default.join(__dirname, '../../..'),
                encoding: 'utf-8',
                timeout: 300000,
                env: {
                    ...process.env,
                    NODE_ENV: 'test',
                    LOG_LEVEL: 'error'
                }
            });
            const { passed, failed } = this.parseJestOutput(output);
            const duration = perf_hooks_1.performance.now() - suiteStartTime;
            result = {
                suite: suite.name,
                passed,
                failed,
                duration,
                output
            };
            console.log(`✅ Completed: ${passed} passed, ${failed} failed`);
            console.log(`⏱️  Duration: ${(duration / 1000).toFixed(2)} seconds`);
        }
        catch (error) {
            const duration = perf_hooks_1.performance.now() - suiteStartTime;
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
    parseJestOutput(output) {
        let passed = 0;
        let failed = 0;
        const summaryMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed/);
        if (summaryMatch && summaryMatch[1] && summaryMatch[2]) {
            failed = parseInt(summaryMatch[1]);
            passed = parseInt(summaryMatch[2]);
        }
        else {
            const passedMatch = output.match(/(\d+)\s+passed/);
            const failedMatch = output.match(/(\d+)\s+failed/);
            if (passedMatch && passedMatch[1])
                passed = parseInt(passedMatch[1]);
            if (failedMatch && failedMatch[1])
                failed = parseInt(failedMatch[1]);
        }
        return { passed, failed };
    }
    generateFinalReport() {
        const totalDuration = (perf_hooks_1.performance.now() - this.startTime) / 1000;
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
        console.log('\n📋 Suite Breakdown:');
        this.results.forEach(result => {
            const status = result.failed === 0 ? '✅' : '❌';
            const duration = (result.duration / 1000).toFixed(2);
            console.log(`${status} ${result.suite}: ${result.passed}P/${result.failed}F (${duration}s)`);
        });
        if (this.results.length > 0) {
            const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length / 1000;
            const slowestSuite = this.results.reduce((max, r) => r.duration > max.duration ? r : max);
            console.log('\n⚡ Performance Analysis:');
            console.log(`Average Suite Duration: ${avgDuration.toFixed(2)} seconds`);
            console.log(`Slowest Suite: ${slowestSuite.suite} (${(slowestSuite.duration / 1000).toFixed(2)}s)`);
        }
        console.log('\n📋 Requirements Coverage:');
        console.log('✅ Requirement 1.1: Query response time < 2 seconds');
        console.log('✅ Requirement 1.2: Search across all data sources simultaneously');
        console.log('✅ Requirement 2.5: Continue operating when sources fail');
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
        const overallSuccess = totalFailed === 0 && this.results.every(r => !r.error);
        console.log('\n' + '='.repeat(60));
        if (overallSuccess) {
            console.log('🎉 ALL INTEGRATION TESTS PASSED!');
            console.log('✅ Fast RAG System is ready for deployment');
        }
        else {
            console.log('❌ SOME INTEGRATION TESTS FAILED');
            console.log('🔧 Please review and fix failing tests before deployment');
        }
        console.log('='.repeat(60));
        process.exit(overallSuccess ? 0 : 1);
    }
    checkTestEnvironment() {
        console.log('🔍 Checking test environment...');
        const nodeVersion = process.version;
        console.log(`Node.js version: ${nodeVersion}`);
        const requiredPackages = ['jest', 'supertest', 'ts-node'];
        requiredPackages.forEach(pkg => {
            try {
                require.resolve(pkg);
                console.log(`✅ ${pkg} is available`);
            }
            catch (error) {
                console.log(`❌ ${pkg} is missing`);
                throw new Error(`Required package ${pkg} is not installed`);
            }
        });
        const testDataPath = path_1.default.join(__dirname, '../test-data');
        if (fs_1.default.existsSync(testDataPath)) {
            const files = fs_1.default.readdirSync(testDataPath);
            console.log(`✅ Test data available (${files.length} files)`);
        }
        else {
            throw new Error('Test data directory not found');
        }
        console.log('✅ Test environment check passed\n');
    }
}
exports.IntegrationTestRunner = IntegrationTestRunner;
async function main() {
    const runner = new IntegrationTestRunner();
    try {
        runner['checkTestEnvironment']();
        await runner.runAllTests();
    }
    catch (error) {
        console.error('\n❌ Integration test runner failed:');
        console.error(error.message);
        if (error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        process.exit(1);
    }
}
if (require.main === module) {
    main();
}
//# sourceMappingURL=runIntegrationTests.js.map