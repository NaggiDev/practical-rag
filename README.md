# Fast RAG System

A high-performance Retrieval-Augmented Generation system designed for rapid information extraction from diverse data sources.

## Project Structure

```
src/
├── api/                    # REST API layer
│   ├── middleware/         # Authentication, rate limiting, validation
│   └── routes/            # API route definitions
├── config/                # Configuration management
│   ├── defaults.ts        # Default configuration values
│   ├── env.ts            # Environment variable loading
│   ├── file.ts           # File-based configuration
│   └── validation.ts     # Configuration validation
├── data/                  # Data access layer
│   ├── connectors/        # Data source connectors
│   └── repositories/      # Data repositories
├── models/                # TypeScript interfaces and types
│   ├── config.ts         # System configuration models
│   ├── content.ts        # Content and indexing models
│   ├── dataSource.ts     # Data source models
│   ├── query.ts          # Query and search models
│   └── response.ts       # Response and result models
├── services/              # Business logic services
├── test/                  # Test utilities and setup
└── utils/                 # Utility functions
```

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```

3. Configure your environment variables in `.env`

4. Build the project:
   ```bash
   npm run build
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## Configuration

The system supports configuration through:
- Environment variables (see `.env.example`)
- JSON configuration files
- Programmatic configuration

Key configuration areas:
- **Server**: Port, CORS, rate limiting
- **Database**: Vector database and metadata storage
- **Cache**: Redis configuration and TTL settings
- **Embedding**: Model provider and settings
- **Search**: Search parameters and hybrid search
- **Monitoring**: Logging, metrics, and health checks

## Development

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run test` - Run test suite
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint issues

## Architecture

The system follows a modular architecture with clear separation of concerns:

1. **API Layer**: Handles HTTP requests and responses
2. **Service Layer**: Contains business logic and orchestration
3. **Data Layer**: Manages data sources and storage
4. **Configuration**: Centralized configuration management
5. **Models**: TypeScript interfaces for type safety

## Requirements

- Node.js >= 18.0.0
- Redis (for caching)
- Vector database (FAISS, Pinecone, Weaviate, or Qdrant)
- Metadata database (PostgreSQL, MongoDB, or SQLite)