"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseGenerator = void 0;
const logger_1 = require("../utils/logger");
class ResponseGenerator {
    constructor(config) {
        this.defaultConfig = {
            maxResponseLength: 2000,
            minSourcesForSynthesis: 2,
            confidenceThreshold: 0.3,
            citationStyle: 'inline',
            enableCoherenceCheck: true,
            maxSourcesInResponse: 5
        };
        this.config = { ...this.defaultConfig, ...config };
        logger_1.logger.info('ResponseGenerator initialized', { config: this.config });
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger_1.logger.info('ResponseGenerator config updated', { config: this.config });
    }
    async generateResponse(searchResults, context) {
        const processingSteps = [];
        try {
            processingSteps.push('Starting response generation');
            processingSteps.push('Filtering and ranking search results');
            const filteredResults = this.filterAndRankResults(searchResults);
            if (filteredResults.length === 0) {
                return this.createEmptyResponse(processingSteps);
            }
            processingSteps.push('Extracting information from search results');
            const extractedInfo = this.extractInformation(filteredResults);
            processingSteps.push('Synthesizing information');
            const synthesizedText = await this.synthesizeInformation(extractedInfo, context);
            processingSteps.push('Calculating confidence score');
            const confidence = this.calculateConfidence(filteredResults, extractedInfo);
            processingSteps.push('Calculating coherence score');
            const coherenceScore = this.config.enableCoherenceCheck
                ? this.calculateCoherenceScore(synthesizedText, extractedInfo)
                : 1.0;
            processingSteps.push('Generating source references');
            const sources = this.generateSourceReferences(filteredResults);
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
        }
        catch (error) {
            logger_1.logger.error('Error in response generation', { error, context });
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
    async synthesizeInformation(extractedInfo, _context) {
        if (extractedInfo.length === 0) {
            return "I couldn't find any relevant information to answer your question.";
        }
        if (extractedInfo.length === 1) {
            return `Based on the available information: ${extractedInfo[0].content}`;
        }
        let synthesized = "Based on multiple sources: ";
        const contentPieces = extractedInfo
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .map(info => info.content)
            .slice(0, 3);
        synthesized += contentPieces.join(' Additionally, ');
        if (synthesized.length > this.config.maxResponseLength) {
            synthesized = this.truncateResponse(synthesized);
        }
        return synthesized;
    }
    filterAndRankResults(searchResults) {
        const filtered = searchResults
            .filter(result => result.relevanceScore >= this.config.confidenceThreshold)
            .filter(result => result.excerpt && result.excerpt.trim().length > 0)
            .sort((a, b) => b.relevanceScore - a.relevanceScore);
        const deduplicated = this.deduplicateResults(filtered);
        return deduplicated.slice(0, this.config.maxSourcesInResponse);
    }
    deduplicateResults(searchResults) {
        const deduplicated = [];
        const similarityThreshold = 0.8;
        for (const result of searchResults) {
            const isSimilar = deduplicated.some(existing => this.calculateTextSimilarity(result.excerpt, existing.excerpt) > similarityThreshold);
            if (!isSimilar) {
                deduplicated.push(result);
            }
        }
        return deduplicated;
    }
    calculateTextSimilarity(text1, text2) {
        const words1 = text1.toLowerCase().split(/\s+/);
        const words2 = text2.toLowerCase().split(/\s+/);
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = new Set([...set1].filter(word => set2.has(word)));
        const union = new Set([...set1, ...set2]);
        return intersection.size / union.size;
    }
    extractInformation(searchResults) {
        return searchResults.map(result => ({
            content: result.excerpt,
            source: result,
            keyPoints: this.extractKeyPoints(result.excerpt),
            relevanceScore: result.relevanceScore
        }));
    }
    extractKeyPoints(text) {
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
        return sentences.slice(0, 2).map(s => s.trim());
    }
    calculateConfidence(searchResults, extractedInfo) {
        if (searchResults.length === 0)
            return 0;
        const avgRelevance = searchResults.reduce((sum, result) => sum + result.relevanceScore, 0) / searchResults.length;
        const sourceBonus = searchResults.length > 1 ? (searchResults.length - 1) * 0.1 : 0;
        const contentLength = extractedInfo.reduce((sum, info) => sum + info.content.length, 0);
        const lengthPenalty = contentLength < 100 ? 0.2 : 0;
        const lowRelevancePenalty = avgRelevance < 0.5 ? 0.1 : 0;
        const confidence = Math.max(0, Math.min(1, avgRelevance + sourceBonus - lengthPenalty - lowRelevancePenalty));
        return Math.round(confidence * 100) / 100;
    }
    calculateCoherenceScore(synthesizedText, extractedInfo) {
        const sentences = synthesizedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length === 0)
            return 0;
        let coherenceScore = 0.5;
        const avgSentenceLength = synthesizedText.length / sentences.length;
        if (avgSentenceLength > 20 && avgSentenceLength < 100) {
            coherenceScore += 0.2;
        }
        if (extractedInfo.length > 1) {
            coherenceScore += 0.2;
        }
        const transitionWords = ['additionally', 'furthermore', 'however', 'therefore', 'moreover'];
        const hasTransitions = transitionWords.some(word => synthesizedText.toLowerCase().includes(word));
        if (hasTransitions) {
            coherenceScore += 0.1;
        }
        return Math.max(0, Math.min(1, coherenceScore));
    }
    generateSourceReferences(searchResults) {
        return searchResults.map(result => ({
            sourceId: result.sourceId,
            sourceName: result.metadata?.sourceName || 'Unknown Source',
            contentId: result.contentId,
            title: result.title,
            excerpt: result.excerpt,
            relevanceScore: result.relevanceScore,
            url: result.metadata?.url
        }));
    }
    applyCitationStyle(text, sources) {
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
    addInlineCitations(text, sources) {
        if (text.endsWith('...')) {
            return text;
        }
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
    addNumberedCitations(text, sources) {
        const citedText = this.addInlineCitations(text, sources);
        const sourcesList = sources.map((source, index) => `[${index + 1}] ${source.sourceName} - ${source.title}${source.url ? ` (${source.url})` : ''}`).join('\n');
        return `${citedText}\n\nSources:\n${sourcesList}`;
    }
    addFootnoteCitations(text, sources) {
        const citedText = this.addInlineCitations(text, sources);
        const footnotes = sources.map((source, index) => `${index + 1}. ${source.sourceName} - ${source.title}${source.url ? ` (${source.url})` : ''}`).join('\n');
        return `${citedText}\n\n---\n${footnotes}`;
    }
    truncateResponse(text) {
        if (text.length <= this.config.maxResponseLength) {
            return text;
        }
        const truncated = text.substring(0, this.config.maxResponseLength);
        const lastSentenceEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
        if (lastSentenceEnd > this.config.maxResponseLength * 0.7) {
            return truncated.substring(0, lastSentenceEnd + 1);
        }
        const ellipsisText = truncated.substring(0, this.config.maxResponseLength - 3) + '...';
        if (!ellipsisText.match(/[.!?]$|\.\.\.$/)) {
            return ellipsisText.substring(0, ellipsisText.length - 3) + '...';
        }
        return ellipsisText;
    }
    createEmptyResponse(processingSteps) {
        return {
            synthesizedText: "I couldn't find any relevant information to answer your question.",
            confidence: 0,
            sources: [],
            coherenceScore: 0,
            processingSteps
        };
    }
    async healthCheck() {
        try {
            const testResults = [{
                    contentId: 'test-content',
                    sourceId: 'test-source',
                    title: 'Test Title',
                    excerpt: 'Test excerpt for health check.',
                    relevanceScore: 0.8,
                    embedding: new Array(384).fill(0.1),
                    metadata: { sourceName: 'Test Source' }
                }];
            const testContext = {
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
        }
        catch (error) {
            logger_1.logger.error('ResponseGenerator health check failed', { error });
            return {
                status: 'unhealthy',
                details: {
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            };
        }
    }
}
exports.ResponseGenerator = ResponseGenerator;
//# sourceMappingURL=responseGenerator.js.map