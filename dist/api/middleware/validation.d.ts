import { NextFunction, Request, Response } from 'express';
import Joi from 'joi';
import { ApiRequest } from '../app';
export declare class ValidationError extends Error {
    details: any[];
    constructor(message: string, details?: any[]);
}
export declare const validationErrorHandler: (req: ApiRequest, res: Response, next: NextFunction) => any;
export declare const validateWithJoi: (schema: Joi.ObjectSchema, target?: "body" | "query" | "params") => (req: Request, res: Response, next: NextFunction) => any;
export declare const commonSchemas: {
    uuid: Joi.StringSchema<string>;
    pagination: Joi.ObjectSchema<any>;
    queryRequest: Joi.ObjectSchema<any>;
    dataSourceRequest: Joi.ObjectSchema<any>;
    healthParams: Joi.ObjectSchema<any>;
};
export declare const sanitizeRequest: (req: Request, _res: Response, next: NextFunction) => void;
export declare const validateContentType: (allowedTypes?: string[]) => (req: Request, res: Response, next: NextFunction) => any;
export declare const validateRequestSize: (maxSizeBytes?: number) => (req: Request, res: Response, next: NextFunction) => any;
//# sourceMappingURL=validation.d.ts.map