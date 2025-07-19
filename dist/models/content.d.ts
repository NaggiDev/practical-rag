export interface ContentChunk {
    id: string;
    text: string;
    embedding: number[];
    position: number;
    metadata: {
        startIndex: number;
        endIndex: number;
        chunkSize: number;
        overlap?: number;
        [key: string]: any;
    };
}
export interface Content {
    id: string;
    sourceId: string;
    title: string;
    text: string;
    metadata: {
        fileType?: string;
        author?: string;
        createdAt?: Date;
        modifiedAt?: Date;
        tags?: string[];
        category?: string;
        [key: string]: any;
    };
    embedding: number[];
    chunks: ContentChunk[];
    lastUpdated: Date;
    version: number;
}
export interface ContentChange {
    contentId: string;
    changeType: 'created' | 'updated' | 'deleted';
    timestamp: Date;
    previousVersion?: number;
    newVersion?: number;
}
export interface IndexedContent {
    contentId: string;
    sourceId: string;
    vectorId: string;
    indexedAt: Date;
    status: 'indexed' | 'pending' | 'failed';
}
export declare class ContentChunkModel implements ContentChunk {
    readonly id: string;
    readonly text: string;
    readonly embedding: number[];
    readonly position: number;
    readonly metadata: {
        startIndex: number;
        endIndex: number;
        chunkSize: number;
        overlap?: number;
        [key: string]: any;
    };
    constructor(data: Partial<ContentChunk>);
    private sanitize;
    private validate;
    toJSON(): ContentChunk;
    static fromJSON(data: any): ContentChunkModel;
}
export declare class ContentModel implements Content {
    readonly id: string;
    readonly sourceId: string;
    readonly title: string;
    readonly text: string;
    readonly metadata: {
        fileType?: string;
        author?: string;
        createdAt?: Date;
        modifiedAt?: Date;
        tags?: string[];
        category?: string;
        [key: string]: any;
    };
    readonly embedding: number[];
    readonly chunks: ContentChunk[];
    readonly lastUpdated: Date;
    readonly version: number;
    constructor(data: Partial<Content>);
    private sanitize;
    private validate;
    toJSON(): Content;
    static fromJSON(data: any): ContentModel;
    updateVersion(): ContentModel;
    addChunk(chunk: ContentChunk): ContentModel;
}
//# sourceMappingURL=content.d.ts.map