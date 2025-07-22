import { SystemConfig } from '../models/config';
export interface ConfigTemplate {
    name: string;
    description: string;
    config: Partial<SystemConfig>;
}
export declare const configTemplates: Record<string, ConfigTemplate>;
export declare class ConfigTemplateManager {
    static getTemplate(name: string): ConfigTemplate | undefined;
    static getAvailableTemplates(): string[];
    static generateConfig(templateName: string, overrides?: Partial<SystemConfig>): SystemConfig;
    static createCustomTemplate(name: string, description: string, config: Partial<SystemConfig>): void;
    static exportTemplate(templateName: string): string;
    static importTemplate(templateData: string): ConfigTemplate;
    private static deepMerge;
}
//# sourceMappingURL=templates.d.ts.map