#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigCLI = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const configManager_1 = require("./configManager");
const envValidator_1 = require("./envValidator");
const templates_1 = require("./templates");
class ConfigCLI {
    constructor() {
        this.configManager = configManager_1.EnhancedConfigManager.getInstance();
    }
    async run(options) {
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
        }
        catch (error) {
            console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
            process.exit(1);
        }
    }
    async initConfig(options) {
        const template = options.flags.template || 'development';
        const environment = options.flags.env || 'development';
        const configDir = options.flags.dir || './config';
        console.log(`Initializing configuration for ${environment} environment...`);
        await fs.promises.mkdir(configDir, { recursive: true });
        const config = templates_1.ConfigTemplateManager.generateConfig(template);
        const configPath = path.join(configDir, `config.${environment}.json`);
        await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
        const envTemplate = envValidator_1.envValidator.generateEnvTemplate();
        const envPath = path.join(process.cwd(), '.env.example');
        await fs.promises.writeFile(envPath, envTemplate, 'utf8');
        console.log(`✅ Configuration initialized:`);
        console.log(`   Config file: ${configPath}`);
        console.log(`   Environment template: ${envPath}`);
        console.log(`   Template used: ${template}`);
    }
    async validateConfig(options) {
        const configPath = options.args[0];
        const environment = options.flags.env;
        console.log('Validating configuration...');
        await this.configManager.loadConfig({
            configPath,
            environment,
            validateOnLoad: true
        });
        const envValidation = envValidator_1.envValidator.validateEnvironment();
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
    async handleTemplate(options) {
        const subCommand = options.args[0];
        switch (subCommand) {
            case 'list':
                this.listTemplates();
                break;
            case 'show':
                if (options.args[1]) {
                    this.showTemplate(options.args[1]);
                }
                else {
                    console.error('Template name is required for show command');
                }
                break;
            case 'generate':
                await this.generateFromTemplate(options);
                break;
            default:
                console.log('Available template commands: list, show, generate');
        }
    }
    listTemplates() {
        const templates = templates_1.ConfigTemplateManager.getAvailableTemplates();
        console.log('Available configuration templates:');
        templates.forEach(name => {
            const template = templates_1.ConfigTemplateManager.getTemplate(name);
            console.log(`  ${name}: ${template?.description || 'No description'}`);
        });
    }
    showTemplate(templateName) {
        if (!templateName) {
            console.error('Template name required');
            return;
        }
        const template = templates_1.ConfigTemplateManager.getTemplate(templateName);
        if (!template) {
            console.error(`Template '${templateName}' not found`);
            return;
        }
        console.log(`Template: ${template.name}`);
        console.log(`Description: ${template.description}`);
        console.log('\nConfiguration:');
        console.log(JSON.stringify(template.config, null, 2));
    }
    async generateFromTemplate(options) {
        const templateName = options.args[1];
        const outputPath = options.args[2] || `./config.${templateName}.json`;
        if (!templateName) {
            console.error('Template name required');
            return;
        }
        const config = templates_1.ConfigTemplateManager.generateConfig(templateName);
        await fs.promises.writeFile(outputPath, JSON.stringify(config, null, 2), 'utf8');
        console.log(`✅ Configuration generated from template '${templateName}' to ${outputPath}`);
    }
    async handleEnvironment(options) {
        const subCommand = options.args[0];
        switch (subCommand) {
            case 'list':
                await this.listEnvironments();
                break;
            case 'switch':
                if (options.args[1]) {
                    await this.switchEnvironment(options.args[1]);
                }
                else {
                    console.error('Environment name is required for switch command');
                }
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
    async listEnvironments() {
        const environments = await this.configManager.getAvailableEnvironments();
        const current = this.configManager.getCurrentEnvironment();
        console.log('Available environments:');
        environments.forEach(env => {
            const marker = env === current ? ' (current)' : '';
            console.log(`  ${env}${marker}`);
        });
    }
    async switchEnvironment(environment) {
        if (!environment) {
            console.error('Environment name required');
            return;
        }
        await this.configManager.switchEnvironment(environment);
        console.log(`✅ Switched to environment: ${environment}`);
    }
    async createEnvironment(options) {
        const environment = options.args[1];
        const template = options.flags.template || 'development';
        if (!environment) {
            console.error('Environment name required');
            return;
        }
        const config = templates_1.ConfigTemplateManager.generateConfig(template);
        await this.configManager.createEnvironmentConfig(environment, config);
        console.log(`✅ Created environment '${environment}' from template '${template}'`);
    }
    validateEnvironmentVars() {
        const result = envValidator_1.envValidator.validateEnvironment();
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
    async exportConfig(options) {
        const outputPath = options.args[0] || './config.export.json';
        const environment = options.flags.env;
        await this.configManager.loadConfig({ environment });
        const exportPath = await this.configManager.exportConfig(outputPath);
        console.log(`✅ Configuration exported to: ${exportPath}`);
    }
    async importConfig(options) {
        const inputPath = options.args[0];
        const environment = options.flags.env;
        if (!inputPath) {
            console.error('Input file path required');
            return;
        }
        await this.configManager.importConfig(inputPath, environment);
        console.log(`✅ Configuration imported from: ${inputPath}`);
    }
    async watchConfig(options) {
        const environment = options.flags.env;
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
        process.on('SIGINT', () => {
            console.log('\n👋 Stopping configuration watcher...');
            this.configManager.destroy();
            process.exit(0);
        });
    }
    async showSummary(options) {
        const environment = options.flags.env;
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
    showHelp() {
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
exports.ConfigCLI = ConfigCLI;
function parseArgs(args) {
    const [command, ...rest] = args;
    const flags = {};
    const cleanArgs = [];
    for (const arg of rest) {
        if (arg.startsWith('--')) {
            const [key, value] = arg.slice(2).split('=');
            if (key) {
                flags[key] = value || true;
            }
        }
        else {
            cleanArgs.push(arg);
        }
    }
    return { command: command || '', args: cleanArgs, flags };
}
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        new ConfigCLI().run({ command: 'help', args: [], flags: {} });
    }
    else {
        const options = parseArgs(args);
        new ConfigCLI().run(options);
    }
}
//# sourceMappingURL=cli.js.map