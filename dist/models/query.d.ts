export interface QueryFilter {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains';
    value: any;
}
export interface Query {
    id: string;
    text: string;
    context?: object;
    filters?: QueryFilter[];
    timestamp: Date;
    userId?: string;
}
export interface ParsedQuery {
    originalText: string;
    processedText: string;
    intent: string;
    entities: string[];
    filters: QueryFilter[];
}
export interface QueryResult {
    id: string;
    response: string;
    sources: SourceReference[];
    confidence: number;
    processingTime: number;
    cached: boolean;
}
export interface SourceReference {
    sourceId: string;
    sourceName: string;
    contentId: string;
    title: string;
    excerpt: string;
    relevanceScore: number;
    url?: string;
}
export declare class QueryModel implements Query {
    readonly id: string;
    readonly text: string;
    readonly context?: object;
    readonly filters?: QueryFilter[];
    readonly timestamp: Date;
    readonly userId?: string;
    constructor(data: Partial<Query>);
    private sanitize;
    private validate;
    toJSON(): Query;
    static fromJSON(data: any): QueryModel;
}
export declare class QueryResultModel implements QueryResult {
    readonly id: string;
    readonly response: string;
    readonly sources: SourceReference[];
    readonly confidence: number;
    readonly processingTime: number;
    readonly cached: boolean;
    constructor(data: Partial<QueryResult>);
    private sanitize;
    private validate;
    toJSON(): QueryResult;
    static fromJSON(data: any): QueryResultModel;
}
//# sourceMappingURL=query.d.ts.map