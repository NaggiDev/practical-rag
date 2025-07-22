#!/usr/bin/env node
interface CLIOptions {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
}
declare class ConfigCLI {
    private configManager;
    constructor();
    run(options: CLIOptions): Promise<void>;
    private initConfig;
    private validateConfig;
    private handleTemplate;
    private listTemplates;
    private showTemplate;
    private generateFromTemplate;
    private handleEnvironment;
    private listEnvironments;
    private switchEnvironment;
    private createEnvironment;
    private validateEnvironmentVars;
    private exportConfig;
    private importConfig;
    private watchConfig;
    private showSummary;
    private showHelp;
}
export { ConfigCLI };
//# sourceMappingURL=cli.d.ts.map