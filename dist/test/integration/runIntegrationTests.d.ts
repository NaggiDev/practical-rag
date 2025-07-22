#!/usr/bin/env ts-node
declare class IntegrationTestRunner {
    private results;
    private startTime;
    constructor();
    runAllTests(): Promise<void>;
    private runTestSuite;
    private parseJestOutput;
    private generateFinalReport;
    private checkTestEnvironment;
}
export { IntegrationTestRunner };
//# sourceMappingURL=runIntegrationTests.d.ts.map