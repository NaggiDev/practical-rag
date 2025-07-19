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
//# sourceMappingURL=query.d.ts.map