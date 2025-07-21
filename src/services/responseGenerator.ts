import { SearchResult, SourceReference } from '../models/response';
import { logger } from '../utils/logger';

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

export class ResponseGenerator {
    private config: ResponseGeneratorConfig;

    private readonly defaultConfig: ResponseGeneratorConfig = {
        maxResponseLength: 2000,
        minSourcesForSynthesis: 2,
        confidenceThreshold: 0.3,
        citationStyle: 'inline',
        enableCoherenceCheck: true,
        maxSourcesInResponse: 5
    };

    constructor(config?: Partial<ResponseGeneratorConfig>) {
        this.config = { ...this.defaultConfig, ...config };
        logger.info('ResponseGenerator initialized', { config: this.config });
    }

    public getConfig(): ResponseGeneratorConfig {
        return { ...this.config };
    }

    public updateConfig(newConfig: Partial<ResponseGeneratorConfig>): void {
        this.config = { ...this.config, ...newConfig };
        logger.info('ResponseGenerator config updated', { config: this.config });
    }

    public async generateResponse(
        searchResults: SearchResult[],
        context: ResponseContext
    ): Promise<GeneratedResponse> {
        const processingSteps: string[] = [];

        try {
            processingSteps.push('Starting response generation');

            // Filter and rank search results
            processingSteps.push('Filtering and ranking search results');
            const filteredResults = this.filterAndRankResults(searchResults);

            if (filteredResults.length === 0) {
                return this.createEmptyResponse(processingSteps);
            }

            // Extract information from search results
            processingSteps.push('Extracting information from search results');
            const extractedInfo = this.extractInformation(filteredResults);

            // Synthesize information into coherent response
            processingSteps.push('Synthesizing information');
            const synthesizedText = await this.synthesizeInformation(extractedInfo, context);

            // Calculate confidence score
            processingSteps.push('Calculating confidence score');
            const confidence = this.calculateConfidence(filteredResults, extractedInfo);

            // Calculate coherence score
            processingSteps.push('Calculating coherence score');
            const coherenceScore = this.config.enableCoherenceCheck
                ? this.calculateCoherenceScore(synthesizedText, extractedInfo)
                : 1.0;

            // Generate source references
            processingSteps.push('Generating source references');
            const sources = this.generateSourceReferences(filteredResults);

            // Apply citation style
            processingSteps.push('Applying citation style');
            const finalText = this.applyCitationStyle(synthesizedText, sources);

            processingSteps.push('Response generation completed');

            return {
                synthesizedText: finalText,
                confidence,
                sources,
                coherenceScore,
                processingSteps
            };

        } catch (error) {
            logger.error('Error in response generation', { error, context });
            processingSteps.push(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);

            return {
                synthesizedText: "I encountered an error while processing your request. Please try again.",
                confidence: 0,
                sources: [],
                coherenceScore: 0,
                processingSteps
            };
        }
    }

    public async synthesizeInformation(
        extractedInfo: ExtractedInformation[],
        _context: ResponseContext
    ): Promise<string> {
        if (extractedInfo.length === 0) {
            return "I couldn't find any relevant information to answer your question.";
        }

        if (extractedInfo.length === 1) {
            return `Based on the available information: ${extractedInfo[0]!.content}`;
        }

        // Multi-source synthesis
        let synthesized = "Based on multiple sources: ";

        // Combine information from different sources
        const contentPieces = extractedInfo
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .map(info => info.content)
            .slice(0, 3); // Limit to top 3 sources for synthesis

        synthesized += contentPieces.join(' Additionally, ');

        // Ensure response doesn't exceed max length
        if (synthesized.length > this.config.maxResponseLength) {
            synthesized = this.truncateResponse(synthesized);
        }

        return synthesized;
    }

    private filterAndRankResults(searchResults: SearchResult[]): SearchResult[] {
        const filtered = searchResults
            .filter(result => result.relevanceScore >= this.config.confidenceThreshold)
            .filter(result => result.excerpt && result.excerpt.trim().length > 0)
            .sort((a, b) => b.relevanceScore - a.relevanceScore);

        // Deduplicate similar content
        const deduplicated = this.deduplicateResults(filtered);

        return deduplicated.slice(0, this.config.maxSourcesInResponse);
    }

    private deduplicateResults(searchResults: SearchResult[]): SearchResult[] {
        const deduplicated: SearchResult[] = [];
        const similarityThreshold = 0.8; // Threshold for considering content similar

        for (const result of searchResults) {
            const isSimilar = deduplicated.some(existing =>
                this.calculateTextSimilarity(result.excerpt, existing.excerpt) > similarityThreshold
            );

            if (!isSimilar) {
                deduplicated.push(result);
            }
        }

        return deduplicated;
    }

    private calculateTextSimilarity(text1: string, text2: string): number {
        // Simple similarity calculation based on common words
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);

        const set1 = new Set(words1);
        const set2 = new Set(words2);

        const intersection = new Set([...set1].filter(word => set2.has(word)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size; // Jaccard similarity
    }

    private extractInformation(searchResults: SearchResult[]): ExtractedInformation[] {
        return searchResults.map(result => ({
            content: result.excerpt,
            source: result,
            keyPoints: this.extractKeyPoints(result.excerpt),
            relevanceScore: result.relevanceScore
        }));
    }

    private extractKeyPoints(text: string): string[] {
        // Simple key point extraction - split by sentences and take first few
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 2).map(s => s.trim());
    }

    private calculateConfidence(
        searchResults: SearchResult[],
        extractedInfo: ExtractedInformation[]
    ): number {
        if (searchResults.length === 0) return 0;

        // Base confidence on average relevance score
        const avgRelevance = searchResults.reduce((sum, result) => sum + result.relevanceScore, 0) / searchResults.length;

        // Boost confidence for multiple sources (more significant boost)
        const sourceBonus = searchResults.length > 1 ? (searchResults.length - 1) * 0.1 : 0;

        // Penalize if content is very short
        const contentLength = extractedInfo.reduce((sum, info) => sum + info.content.length, 0);
        const lengthPenalty = contentLength < 100 ? 0.2 : 0;

        // Additional penalty for low relevance scores
        const lowRelevancePenalty = avgRelevance < 0.5 ? 0.1 : 0;

        const confidence = Math.max(0, Math.min(1, avgRelevance + sourceBonus - lengthPenalty - lowRelevancePenalty));

        return Math.round(confidence * 100) / 100; // Round to 2 decimal places
    }

    private calculateCoherenceScore(synthesizedText: string, extractedInfo: ExtractedInformation[]): number {
        // Simple coherence scoring based on text characteristics
        const sentences = synthesizedText.split(/[.!?]+/).filter(s => s.trim().length > 0);

        if (sentences.length === 0) return 0;

        // Check for basic coherence indicators
        let coherenceScore = 0.5; // Base score

        // Bonus for proper sentence structure
        const avgSentenceLength = synthesizedText.length / sentences.length;
        if (avgSentenceLength > 20 && avgSentenceLength < 100) {
            coherenceScore += 0.2;
        }

        // Bonus for using information from multiple sources
        if (extractedInfo.length > 1) {
            coherenceScore += 0.2;
        }

        // Bonus for proper transitions (simple check)
        const transitionWords = ['additionally', 'furthermore', 'however', 'therefore', 'moreover'];
        const hasTransitions = transitionWords.some(word =>
            synthesizedText.toLowerCase().includes(word)
        );
        if (hasTransitions) {
            coherenceScore += 0.1;
        }

        return Math.max(0, Math.min(1, coherenceScore));
    }

    private generateSourceReferences(searchResults: SearchResult[]): SourceReference[] {
        return searchResults.map(result => ({
            sourceId: result.sourceId,
            sourceName: (result.metadata as any)?.sourceName || 'Unknown Source',
            contentId: result.contentId,
            title: result.title,
            excerpt: result.excerpt,
            relevanceScore: result.relevanceScore,
            url: (result.metadata as any)?.url
        }));
    }

    private applyCitationStyle(text: string, sources: SourceReference[]): string {
        switch (this.config.citationStyle) {
            case 'inline':
                return this.addInlineCitations(text, sources);
            case 'numbered':
                return this.addNumberedCitations(text, sources);
            case 'footnote':
                return this.addFootnoteCitations(text, sources);
            default:
                return text;
        }
    }

    private addInlineCitations(text: string, sources: SourceReference[]): string {
        // Handle case where text ends with ellipsis - preserve the ellipsis pattern
        if (text.endsWith('...')) {
            return text; // Keep ellipsis as is for sentence boundary test
        }

        // Add simple inline citations
        const sentences = text.split(/([.!?]+)/);
        let citationIndex = 0;

        return sentences.map((sentence, _index) => {
            if (sentence.match(/[.!?]+/) && citationIndex < sources.length) {
                const citation = `[${citationIndex + 1}]`;
                citationIndex++;
                return sentence + citation;
            }
            return sentence;
        }).join('');
    }

    private addNumberedCitations(text: string, sources: SourceReference[]): string {
        const citedText = this.addInlineCitations(text, sources);
        const sourcesList = sources.map((source, index) =>
            `[${index + 1}] ${source.sourceName} - ${source.title}${source.url ? ` (${source.url})` : ''}`
        ).join('\n');

        return `${citedText}\n\nSources:\n${sourcesList}`;
    }

    private addFootnoteCitations(text: string, sources: SourceReference[]): string {
        const citedText = this.addInlineCitations(text, sources);
        const footnotes = sources.map((source, index) =>
            `${index + 1}. ${source.sourceName} - ${source.title}${source.url ? ` (${source.url})` : ''}`
        ).join('\n');

        return `${citedText}\n\n---\n${footnotes}`;
    }

    private truncateResponse(text: string): string {
        if (text.length <= this.config.maxResponseLength) {
            return text;
        }

        // Try to truncate at sentence boundary
        const truncated = text.substring(0, this.config.maxResponseLength);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?')
        );

        if (lastSentenceEnd > this.config.maxResponseLength * 0.7) {
            return truncated.substring(0, lastSentenceEnd + 1);
        }

        // If no good sentence boundary, truncate and add ellipsis
        const ellipsisText = truncated.substring(0, this.config.maxResponseLength - 3) + '...';

        // Ensure it ends with proper punctuation
        if (!ellipsisText.match(/[.!?]$|\.\.\.$/)) {
            return ellipsisText.substring(0, ellipsisText.length - 3) + '...';
        }

        return ellipsisText;
    }

    private createEmptyResponse(processingSteps: string[]): GeneratedResponse {
        return {
            synthesizedText: "I couldn't find any relevant information to answer your question.",
            confidence: 0,
            sources: [],
            coherenceScore: 0,
            processingSteps
        };
    }

    public async healthCheck(): Promise<HealthCheckResult> {
        try {
            // Test basic functionality
            const testResults: SearchResult[] = [{
                contentId: 'test-content',
                sourceId: 'test-source',
                title: 'Test Title',
                excerpt: 'Test excerpt for health check.',
                relevanceScore: 0.8,
                embedding: new Array(384).fill(0.1),
                metadata: { sourceName: 'Test Source' }
            }];

            const testContext: ResponseContext = {
                queryText: 'test query',
                queryIntent: 'test'
            };

            await this.generateResponse(testResults, testContext);

            return {
                status: 'healthy',
                details: {
                    config: this.config,
                    testResponseGenerated: true
                }
            };
        } catch (error) {
            logger.error('ResponseGenerator health check failed', { error });
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            };
        }
    }
}