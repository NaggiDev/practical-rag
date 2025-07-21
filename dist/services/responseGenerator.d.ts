import { SearchResult, SourceReference } from '../models/response';
export interface ResponseGeneratorConfig {
    maxResponseLength: number;
    minSourcesForSynthesis: number;
    confidenceThreshold: number;
    citationStyle: 'inline' | 'numbered' | 'footnote';
    enableCoherenceCheck: boolean;
    maxSourcesInResponse: number;
}
export interface ResponseContext {
    queryText: string;
    queryIntent?: string;
}
export interface ExtractedInformation {
    content: string;
    source: SearchResult;
    keyPoints: string[];
    relevanceScore: number;
}
export interface GeneratedResponse {
    synthesizedText: string;
    confidence: number;
    sources: SourceReference[];
    coherenceScore: number;
    processingSteps: string[];
}
export interface HealthCheckResult {
    status: 'healthy' | 'unhealthy';
    details: {
        config?: ResponseGeneratorConfig;
        testResponseGenerated?: boolean;
        error?: string;
    };
}
export declare class ResponseGenerator {
    private config;
    private readonly defaultConfig;
    constructor(config?: Partial<ResponseGeneratorConfig>);
    getConfig(): ResponseGeneratorConfig;
    updateConfig(newConfig: Partial<ResponseGeneratorConfig>): void;
    generateResponse(searchResults: SearchResult[], context: ResponseContext): Promise<GeneratedResponse>;
    synthesizeInformation(extractedInfo: ExtractedInformation[], _context: ResponseContext): Promise<string>;
    private filterAndRankResults;
    private deduplicateResults;
    private calculateTextSimilarity;
    private extractInformation;
    private extractKeyPoints;
    private calculateConfidence;
    private calculateCoherenceScore;
    private generateSourceReferences;
    private applyCitationStyle;
    private addInlineCitations;
    private addNumberedCitations;
    private addFootnoteCitations;
    private truncateResponse;
    private createEmptyResponse;
    healthCheck(): Promise<HealthCheckResult>;
}
//# sourceMappingURL=responseGenerator.d.ts.map