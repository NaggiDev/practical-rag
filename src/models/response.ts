export interface SearchResult {
    contentId: string;
    sourceId: string;
    title: string;
    excerpt: string;
    relevanceScore: number;
    embedding: number[];
    metadata: object;
    chunkId?: string;
}

export interface Response {
    id: string;
    queryId: string;
    text: string;
    sources: SourceReference[];
    confidence: number;
    generatedAt: Date;
    processingSteps: ProcessingStep[];
}

export interface ProcessingStep {
    step: string;
    duration: number;
    status: 'completed' | 'failed' | 'skipped';
    details?: object;
}

export interface ErrorResponse {
    error: {
        code: string;
        message: string;
        details?: object;
        timestamp: Date;
        correlationId: string;
    };
}

export interface HealthResponse {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: Date;
    services: ServiceHealth[];
    uptime: number;
}

export interface ServiceHealth {
    name: string;
    status: 'healthy' | 'unhealthy';
    responseTime?: number;
    lastCheck: Date;
    details?: object;
}

// Import SourceReference from query model
import type { SourceReference } from './query';

// Re-export for convenience
export type { SourceReference };
