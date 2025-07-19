export interface EnvironmentValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    sanitizedEnv: Record<string, any>;
}
export declare class EnvironmentValidator {
    private static instance;
    private validatedEnv;
    private constructor();
    static getInstance(): EnvironmentValidator;
    validateEnvironment(): EnvironmentValidationResult;
    private performCustomValidations;
    getValidatedEnvironment(): Record<string, any>;
    getEnvironmentVariable(key: string, defaultValue?: any): any;
    isProduction(): boolean;
    isDevelopment(): boolean;
    isTest(): boolean;
    generateEnvTemplate(): string;
}
export declare const envValidator: EnvironmentValidator;
//# sourceMappingURL=envValidator.d.ts.map