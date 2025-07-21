import { Application, Request } from 'express';
export interface ApiRequest extends Request {
    correlationId: string;
    userId?: string;
    startTime: number;
}
export interface AuthenticatedRequest extends ApiRequest {
    userId: string;
    userRole?: string;
}
export declare class ApiGateway {
    private app;
    private readonly port;
    private readonly host;
    constructor(port?: number, host?: string);
    private setupMiddleware;
    private setupRoutes;
    private setupErrorHandling;
    start(): Promise<void>;
    getApp(): Application;
}
export declare const apiGateway: ApiGateway;
//# sourceMappingURL=app.d.ts.map