# Fast RAG System - Integration Test Suite

This directory contains comprehensive integration tests for the Fast RAG System, covering end-to-end functionality, performance benchmarking, load testing, and failure scenario validation.

## Overview

The integration test suite validates that the Fast RAG System meets all specified requirements:

- **Requirement 1.1**: Query response time < 2 seconds for typical queries
- **Requirement 1.2**: Search across all configured data sources simultaneously  
- **Requirement 2.5**: Continue operating with remaining sources when some fail

## Test Structure

### Test Files

1. **`integrationTestSuite.test.ts`** - Test suite coordination and validation
2. **`endToEnd.integration.test.ts`** - Complete query processing flow tests
3. **`performance.integration.test.ts`** - Performance benchmarking tests
4. **`loadTesting.integration.test.ts`** - Concurrent query handling tests
5. **`failureScenarios.integration.test.ts`** - Graceful degradation tests
6. **`runIntegrationTests.ts`** - Test runner script

### Test Data

- **`../test-data/sample.txt`** - Basic test content
- **`../test-data/integration-test-doc.md`** - Comprehensive test documentation
- **`../test-data/performance-test-data.txt`** - Performance testing content

## Running Tests

### All Integration Tests
```bash
npm run test:integration
```

### Individual Test Suites
```bash
# End-to-end tests
npm run test:integration:e2e

# Performance tests
npm run test:integration:performance

# Load tests
npm run test:integration:load

# Failure scenario tests
npm run test:integration:failures
```

### All Tests (Unit + Integration)
```bash
npm run test:all
```

## Test Categories

### 1. End-to-End Integration Tests

**File**: `endToEnd.integration.test.ts`

**Purpose**: Validates complete query processing flow from API request to response

**Test Cases**:
- Complete query processing within 2 seconds
- Multi-source search execution
- Result ranking by relevance
- Semantic search functionality
- Information synthesis from multiple sources
- Caching performance (< 500ms for cached queries)
- API interface compliance
- Data source validation and health monitoring
- System monitoring and metrics collection
- Error handling and resilience

### 2. Performance Benchmarking Tests

**File**: `performance.integration.test.ts`

**Purpose**: Validates system meets performance requirements under various conditions

**Test Cases**:
- Response time benchmarks (typical, cached, complex queries)
- Throughput benchmarks (sequential and burst traffic)
- Memory and resource usage validation
- Cache efficiency testing
- Scalability with increasing data sources
- Performance regression detection

**Performance Thresholds**:
- Typical queries: < 2000ms
- Cached queries: < 500ms
- Minimum throughput: 10 QPS
- Memory increase: < 100MB during load

### 3. Load Testing

**File**: `loadTesting.integration.test.ts`

**Purpose**: Validates system handles concurrent load effectively

**Load Scenarios**:
- **Light Load**: 5 concurrent users for 10 seconds
- **Medium Load**: 15 concurrent users for 20 seconds  
- **Heavy Load**: 30 concurrent users for 30 seconds
- **Stress Load**: 50+ concurrent users for 15 seconds

**Test Cases**:
- Concurrent query handling at different load levels
- Mixed query type processing
- Burst traffic followed by sustained load
- Resource utilization under load
- Cache performance during concurrent access

### 4. Failure Scenarios

**File**: `failureScenarios.integration.test.ts`

**Purpose**: Validates graceful degradation and recovery capabilities

**Failure Types**:
- Single and multiple data source failures
- Network connectivity issues (timeouts, DNS failures)
- Data corruption and invalid content
- Resource exhaustion scenarios
- Recovery and resilience testing

**Test Cases**:
- Continued operation with failing sources
- Timeout handling for slow sources
- Cascading failure management
- Error reporting and monitoring
- Circuit breaker functionality
- Recovery from temporary failures

## Test Environment

### Prerequisites

- Node.js 18+
- All project dependencies installed
- Test environment variables configured
- Test data files available

### Environment Setup

The tests automatically configure the test environment:

```typescript
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
```

### Test Isolation

Each test suite:
- Uses independent service instances
- Cleans up resources in `afterAll` hooks
- Handles errors gracefully with try/catch blocks
- Provides proper timeout handling

## Performance Expectations

### Test Execution Times

- **Individual test**: < 30 seconds
- **Complete suite**: < 10 minutes
- **Average test duration**: < 5 seconds

### Success Criteria

- **Overall success rate**: > 95%
- **Load test success rate**: > 90% (heavy load), > 80% (stress load)
- **Cache hit rate**: > 50% for repeated queries
- **Memory stability**: < 200MB increase during sustained load

## Monitoring and Reporting

### Test Results

The test runner provides comprehensive reporting:

- Suite-by-suite breakdown
- Performance analysis
- Requirements coverage validation
- Error summaries
- Resource utilization metrics

### Metrics Collected

- Response times (average, p50, p95, p99)
- Success/failure rates
- Cache hit rates
- Memory usage patterns
- Throughput measurements
- Error categorization

## Troubleshooting

### Common Issues

1. **Test timeouts**: Increase Jest timeout or optimize test data
2. **Memory issues**: Reduce concurrent load or test data size
3. **Port conflicts**: Ensure test ports are available
4. **Data source failures**: Check test data file availability

### Debug Mode

Run tests with additional logging:

```bash
NODE_ENV=test LOG_LEVEL=debug npm run test:integration
```

### Individual Test Debugging

```bash
# Run specific test file with verbose output
npx jest --testPathPattern=endToEnd.integration.test.ts --verbose --detectOpenHandles
```

## Continuous Integration

### CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run Integration Tests
  run: npm run test:integration
  timeout-minutes: 15
```

### Performance Monitoring

Set up alerts for:
- Test execution time increases
- Success rate degradation
- Memory usage spikes
- Response time regressions

## Contributing

### Adding New Tests

1. Follow existing test structure and naming conventions
2. Include proper setup/teardown in `beforeAll`/`afterAll`
3. Add comprehensive error handling
4. Update this README with new test descriptions
5. Ensure tests are isolated and independent

### Test Data

- Add new test data files to `../test-data/`
- Keep test data minimal but representative
- Document test data purpose and structure
- Clean up temporary test data in tests

### Performance Considerations

- Keep test execution time reasonable
- Use appropriate timeouts
- Clean up resources properly
- Monitor memory usage in tests
- Optimize test data size

## Requirements Traceability

| Requirement | Test File | Test Case |
|-------------|-----------|-----------|
| 1.1 - Response time < 2s | `endToEnd.integration.test.ts` | "should process a query end-to-end within 2 seconds" |
| 1.1 - Response time < 2s | `performance.integration.test.ts` | "should meet typical query response time requirement" |
| 1.2 - Multi-source search | `endToEnd.integration.test.ts` | "should search across all configured data sources simultaneously" |
| 2.5 - Graceful degradation | `failureScenarios.integration.test.ts` | "should continue operating when one data source fails" |

This comprehensive integration test suite ensures the Fast RAG System meets all performance, reliability, and functionality requirements before deployment.