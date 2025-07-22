# Configuration Management System

This module provides a comprehensive configuration management system for the Fast RAG System with support for:

- Environment-specific configurations
- Configuration validation
- Hot-reloading capabilities
- Configuration templates
- Environment variable integration

## Usage

### Basic Usage

```typescript
import { configService } from '../config';

// Initialize configuration
await configService.initialize();

// Get configuration
const config = configService.getConfig();

// Use configuration values
const port = config.server.port;
```

### Environment-Specific Configuration

```typescript
// Initialize with specific environment
await configService.initialize({ environment: 'production' });

// Switch environments
await configService.switchEnvironment('development');

// Get available environments
const environments = await configService.getAvailableEnvironments();

// Create a new environment configuration
await configService.createEnvironmentConfig('staging', 'production'); // Use production template
```

### Configuration Hot-Reloading

```typescript
// Initialize with hot-reloading enabled
await configService.initialize({ watchForChanges: true });

// Listen for configuration changes
configService.onConfigChange((newConfig) => {
  console.log('Configuration changed:', newConfig);
  // Update application state based on new configuration
});
```

### Configuration Import/Export

```typescript
// Export current configuration to file
const exportPath = await configService.exportConfig('./config-export.json');

// Import configuration from file
await configService.importConfig('./config-import.json');

// Import and apply to specific environment
await configService.importConfig('./config-import.json', 'staging');
```

## Configuration Files

The system looks for configuration files in the following order:

1. Base configuration: `{configDir}/config.json`
2. Environment-specific configuration: `{configDir}/config.{environment}.json`
3. Environment variables (if `mergeWithEnv` is enabled)

Each level overrides values from the previous level.

## Environment Variables

All configuration options can be set via environment variables. See `.env.example` for a complete list of supported variables.

## Configuration Templates

The system includes several pre-defined configuration templates:

- `development`: Optimized for local development
- `production`: Optimized for production deployment
- `testing`: Optimized for automated testing
- `minimal`: Minimal configuration with local file-based storage
- `highPerformance`: Optimized for high-throughput scenarios

Use templates to quickly create new environment configurations:

```typescript
await configService.createEnvironmentConfig('staging', 'production');
```

## Advanced Usage

### Custom Configuration Loader

```typescript
import { ConfigLoader } from '../config';

const loader = new ConfigLoader({
  configDir: './custom-config',
  environment: 'custom',
  watchForChanges: true,
  mergeWithEnv: true
});

const config = await loader.loadConfig();
```

### Configuration Watcher

```typescript
import { ConfigWatcher } from '../config';

const watcher = new ConfigWatcher({
  configPaths: ['./config/config.json', './config/config.production.json'],
  debounceMs: 300,
  enabled: true
});

watcher.on('change', (filePath) => {
  console.log(`Configuration file changed: ${filePath}`);
  // Reload configuration
});
```