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