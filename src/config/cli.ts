#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { EnhancedConfigManager } from './configManager';
import { envValidator } from './envValidator';
import { ConfigTemplateManager } from './templates';

interface CLIOptions {
    command: string;
    args: string[];
    flags: Record<string, string | boolean>;
}

class ConfigCLI {
    private configManager: EnhancedConfigManager;

    constructor() {
        this.configManager = EnhancedConfigManager.getInstance();
    }

    public async run(options: CLIOptions): Promise<void> {
        try {
            switch (options.command) {
                case 'init':
                    await this.initConfig(options);
                    break;
                case 'validate':
                    await this.validateConfig(options);
                    break;
                case 'template':
                    await this.handleTemplate(options);
                    break;
                case 'env':
                    await this.handleEnvironment(options);
                    break;
                case 'export':
                    await this.exportConfig(options);
                    break;
                case 'import':
                    await this.importConfig(options);
                    break;
                case 'watch':
                    await this.watchConfig(options);
                    break;
                case 'summary':
                    await this.showSummary(options);
                    break;
                default:
                    this.showHelp();
            }
        } catch (error) {
            console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    }

    private async initConfig(options: CLIOptions): Promise<void> {
        const template = options.flags.template as string || 'development';
        const environment = options.flags.env as string || 'development';
        const configDir = options.flags.dir as string || './config';

        console.log(`Initializing configuration for ${environment} environment...`);

        // Create config directory
        await fs.promises.mkdir(configDir, { recursive: true });

        // Generate configuration from template
        const config = ConfigTemplateManager.generateConfig(template);

        // Save environment-specific configuration
        const configPath = path.join(configDir, `config.${environment}.json`);
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

        // Generate .env template
        const envTemplate = envValidator.generateEnvTemplate();
        const envPath = path.join(process.cwd(), '.env.example');
        await fs.promises.writeFile(envPath, envTemplate, 'utf8');

        console.log(`✅ Configuration initialized:`);
        console.log(`   Config file: ${configPath}`);
        console.log(`   Environment template: ${envPath}`);
        console.log(`   Template used: ${template}`);
    }

    private async validateConfig(options: CLIOptions): Promise<void> {
        const configPath = options.args[0];
        const environment = options.flags.env as string;

        console.log('Validating configuration...');

        // Load and validate configuration
        await this.configManager.loadConfig({
            configPath,
            environment,
            validateOnLoad: true
        });

        // Validate environment variables
        const envValidation = envValidator.validateEnvironment();

        console.log('✅ Configuration validation results:');
        console.log(`   Config: Valid`);
        console.log(`   Environment: ${envValidation.valid ? 'Valid' : 'Invalid'}`);

        if (envValidation.errors.length > 0) {
            console.log('\n❌ Environment errors:');
            envValidation.errors.forEach(error => console.log(`   - ${error}`));
        }

        if (envValidation.warnings.length > 0) {
            console.log('\n⚠️  Environment warnings:');
            envValidation.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
    }

    private async handleTemplate(options: CLIOptions): Promise<void> {
        const subCommand = options.args[0];

        switch (subCommand) {
            case 'list':
                this.listTemplates();
                break;
            case 'show':
                this.showTemplate(options.args[1]);
                break;
            case 'generate':
                await this.generateFromTemplate(options);
                break;
            default:
                console.log('Available template commands: list, show, generate');
        }
    }

    private listTemplates(): void {
        const templates = ConfigTemplateManager.getAvailableTemplates();

        console.log('Available configuration templates:');
        templates.forEach(name => {
            const template = ConfigTemplateManager.getTemplate(name);
            console.log(`  ${name}: ${template?.description || 'No description'}`);
        });
    }

    private showTemplate(templateName: string): void {
        if (!templateName) {
            console.error('Template name required');
            return;
        }

        const template = ConfigTemplateManager.getTemplate(templateName);
        if (!template) {
            console.error(`Template '${templateName}' not found`);
            return;
        }

        console.log(`Template: ${template.name}`);
        console.log(`Description: ${template.description}`);
        console.log('\nConfiguration:');
        console.log(JSON.stringify(template.config, null, 2));
    }

    private async generateFromTemplate(options: CLIOptions): Promise<void> {
        const templateName = options.args[1];
        const outputPath = options.args[2] || `./config.${templateName}.json`;

        if (!templateName) {
            console.error('Template name required');
            return;
        }

        const config = ConfigTemplateManager.generateConfig(templateName);
        await fs.promises.writeFile(outputPath, JSON.stringify(config, null, 2), 'utf8');

        console.log(`✅ Configuration generated from template '${templateName}' to ${outputPath}`);
    }

    private async handleEnvironment(options: CLIOptions): Promise<void> {
        const subCommand = options.args[0];

        switch (subCommand) {
            case 'list':
                await this.listEnvironments();
                break;
            case 'switch':
                await this.switchEnvironment(options.args[1]);
                break;
            case 'create':
                await this.createEnvironment(options);
                break;
            case 'validate':
                this.validateEnvironmentVars();
                break;
            default:
                console.log('Available environment commands: list, switch, create, validate');
        }
    }

    private async listEnvironments(): Promise<void> {
        const environments = await this.configManager.getAvailableEnvironments();
        const current = this.configManager.getCurrentEnvironment();

        console.log('Available environments:');
        environments.forEach(env => {
            const marker = env === current ? ' (current)' : '';
            console.log(`  ${env}${marker}`);
        });
    }

    private async switchEnvironment(environment: string): Promise<void> {
        if (!environment) {
            console.error('Environment name required');
            return;
        }

        await this.configManager.switchEnvironment(environment);
        console.log(`✅ Switched to environment: ${environment}`);
    }

    private async createEnvironment(options: CLIOptions): Promise<void> {
        const environment = options.args[1];
        const template = options.flags.template as string || 'development';

        if (!environment) {
            console.error('Environment name required');
            return;
        }

        const config = ConfigTemplateManager.generateConfig(template);
        await this.configManager.createEnvironmentConfig(environment, config);

        console.log(`✅ Created environment '${environment}' from template '${template}'`);
    }

    private validateEnvironmentVars(): void {
        const result = envValidator.validateEnvironment();

        console.log('Environment variable validation:');
        console.log(`Status: ${result.valid ? 'Valid' : 'Invalid'}`);

        if (result.errors.length > 0) {
            console.log('\n❌ Errors:');
            result.errors.forEach(error => console.log(`   - ${error}`));
        }

        if (result.warnings.length > 0) {
            console.log('\n⚠️  Warnings:');
            result.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
    }

    private async exportConfig(options: CLIOptions): Promise<void> {
        const outputPath = options.args[0] || './config.export.json';
        const environment = options.flags.env as string;

        await this.configManager.loadConfig({ environment });
        const exportPath = await this.configManager.exportConfig(outputPath);

        console.log(`✅ Configuration exported to: ${exportPath}`);
    }

    private async importConfig(options: CLIOptions): Promise<void> {
        const inputPath = options.args[0];
        const environment = options.flags.env as string;

        if (!inputPath) {
            console.error('Input file path required');
            return;
        }

        await this.configManager.importConfig(inputPath, environment);
        console.log(`✅ Configuration imported from: ${inputPath}`);
    }

    private async watchConfig(options: CLIOptions): Promise<void> {
        const environment = options.flags.env as string;
        const configPath = options.args[0];

        console.log('Starting configuration watcher...');

        await this.configManager.loadConfig({
            environment,
            configPath,
            watchForChanges: true
        });

        this.configManager.onConfigChange((config) => {
            console.log(`🔄 Configuration reloaded at ${new Date().toISOString()}`);
            if (options.flags.verbose) {
                console.log('New configuration:', JSON.stringify(config, null, 2));
            }
        });

        console.log('✅ Watching for configuration changes... (Press Ctrl+C to stop)');

        // Keep process alive
        process.on('SIGINT', () => {
            console.log('\n👋 Stopping configuration watcher...');
            this.configManager.destroy();
            process.exit(0);
        });
    }

    private async showSummary(options: CLIOptions): Promise<void> {
        const environment = options.flags.env as string;

        await this.configManager.loadConfig({ environment });
        const summary = this.configManager.getConfigSummary();

        console.log('Configuration Summary:');
        console.log(`  Environment: ${summary.environment}`);
        console.log(`  Config Path: ${summary.configPath || 'Environment variables'}`);
        console.log(`  Hot Reload: ${summary.watchForChanges ? 'Enabled' : 'Disabled'}`);
        console.log(`  Last Modified: ${summary.lastModified?.toISOString() || 'Unknown'}`);
        console.log(`  Data Sources: ${summary.dataSources}`);
        console.log(`  Validation: ${summary.validationStatus}`);
    }

    private showHelp(): void {
        console.log(`
Fast RAG Configuration CLI

Usage: config-cli <command> [options]

Commands:
  init [--template=<name>] [--env=<env>] [--dir=<dir>]
    Initialize configuration files

  validate [config-file] [--env=<env>]
    Validate configuration and environment variables

  template <list|show|generate> [template-name] [output-file]
    Manage configuration templates

  env <list|switch|create|validate> [env-name] [--template=<name>]
    Manage environments

  export [output-file] [--env=<env>]
    Export current configuration

  import <input-file> [--env=<env>]
    Import configuration from file

  watch [config-file] [--env=<env>] [--verbose]
    Watch for configuration changes

  summary [--env=<env>]
    Show configuration summary

Options:
  --template=<name>    Configuration template to use
  --env=<environment>  Target environment
  --dir=<directory>    Configuration directory
  --verbose           Show detailed output

Examples:
  config-cli init --template=production --env=prod
  config-cli validate ./config/config.json
  config-cli template list
  config-cli env switch development
  config-cli watch --env=development --verbose
`);
    }
}

// Parse command line arguments
function parseArgs(args: string[]): CLIOptions {
    const [command, ...rest] = args;
    const flags: Record<string, string | boolean> = {};
    const cleanArgs: string[] = [];

    for (const arg of rest) {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            flags[key] = value || true;
        } else {
            cleanArgs.push(arg);
        }
    }

    return { command, args: cleanArgs, flags };
}

// Main execution
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        new ConfigCLI().run({ command: 'help', args: [], flags: {} });
    } else {
        const options = parseArgs(args);
        new ConfigCLI().run(options);
    }
}

export { ConfigCLI };
