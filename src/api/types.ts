/**
 * Source file information for API requests
 */
export interface SourceFile {
    fileName: string;
    packageName: string;
    content: string;
}

/**
 * Generated test file information
 */
export interface TestFile {
    fileName: string;
    packageName: string;
    content: string;
    suggestedPath: string;
}

/**
 * Test generation options
 */
export interface GenerationOptions {
    testFramework: 'junit4' | 'junit5';
    mockingFramework: 'mockito' | 'easymock';
    coverageTarget: number;
    includeEdgeCases: boolean;
    springBootVersion?: string;
}

/**
 * Request body for test generation API
 */
export interface GenerateTestRequest {
    sourceFile: SourceFile;
    dependencies?: SourceFile[];
    options: GenerationOptions;
    scenarios?: string;
    selectedMethods?: string[];
    cachedAst?: CachedAstData;
}

/**
 * AST analysis summary
 */
export interface AstSummary {
    methodCount: number;
    publicMethods: string[];
    dependencies: string[];
    annotations?: string[];
}

/**
 * Mocking suggestion for a dependency
 */
export interface MockingSuggestion {
    interface: string;
    suggestedMocks: string[];
    strategy?: string;
}

/**
 * Analysis result from the server
 */
export interface AnalysisResult {
    astSummary?: AstSummary;
    mockingSuggestions?: MockingSuggestion[];
    argumentCaptorAdvice?: string[];
    selfHealingGuide?: string;
}

/**
 * Metadata about the generation process
 */
export interface GenerationMetadata {
    generationTime: number;
    tokensUsed?: number;
    modelUsed?: string;
    retryCount?: number;
}

/**
 * Successful response from test generation API
 */
export interface GenerateTestResponse {
    success: true;
    testFile: TestFile;
    analysis?: AnalysisResult;
    metadata?: GenerationMetadata;
}

/**
 * Error information in API response
 */
export interface ApiErrorInfo {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId?: string;
}

/**
 * Error response from API
 */
export interface ApiErrorResponse {
    success: false;
    error: ApiErrorInfo;
}

/**
 * Health check response
 * @see server_api_docs.md - GET /health
 */
export interface HealthCheckResponse {
    /** Service status: "healthy" or "degraded" */
    status: 'healthy' | 'degraded';
    /** API version */
    version: string;
    /** List of available features */
    features: string[];
    /** Health check timestamp (ISO 8601 format) */
    timestamp: string;
    /** Redis connection status */
    redis_connected: boolean;
}

/**
 * Request body for scenario generation API
 */
export interface GenerateScenariosRequest {
    sourceFile: SourceFile;
    options: GenerationOptions;
    selectedMethods?: string[];
    cachedAst?: CachedAstData;
    previousScenarios?: string;
    feedback?: string;
}

/**
 * Response from scenario generation API
 */
export interface GenerateScenariosResponse {
    success: true;
    scenarios: string;
}

/**
 * Complexity analysis result
 */
export interface ComplexityAnalysis {
    cyclomaticComplexity: number;
    linesOfCode: number;
    methodComplexities?: Record<string, number>;
}

/**
 * Error codes used by the API
 */
export enum ApiErrorCode {
    INVALID_API_KEY = 'INVALID_API_KEY',
    RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
    INVALID_JAVA_SYNTAX = 'INVALID_JAVA_SYNTAX',
    MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
    FILE_TOO_LARGE = 'FILE_TOO_LARGE',
    GENERATION_FAILED = 'GENERATION_FAILED',
    VALIDATION_FAILED = 'VALIDATION_FAILED',
    SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}

/**
 * Cached AST data for API requests
 */
export interface CachedAstData {
    className: string;
    packageName: string;
    methodCount: number;
    publicMethods: string[];
    privateMethods: string[];
    protectedMethods: string[];
    dependencies: string[];
    imports: string[];
    annotations: string[];
    injectedBeans: string[];
    complexity: {
        cyclomaticComplexity: number;
        linesOfCode: number;
        methodComplexities: Record<string, number>;
    };
}

/**
 * Request body for testability check API
 */
export interface TestabilityCheckRequest {
    sourceFile: SourceFile;
    cachedAst?: CachedAstData;
    selectedMethods: string[];
}

/**
 * Refactoring advice for untestable code
 */
export interface RefactoringAdvice {
    method: string;
    issue: string;
    suggestion: string;
    severity: 'error' | 'warning' | 'info';
}

/**
 * Response from testability check API
 */
export interface TestabilityCheckResponse {
    success: boolean;
    testable: boolean;
    reasons?: string[];
    refactoringAdvice?: RefactoringAdvice[];
}

/**
 * Jacoco coverage result for a class
 */
export interface JacocoCoverageResult {
    className: string;
    packageName: string;
    lineCoverage: number;
    branchCoverage: number;
    methodCoverage: Record<string, {
        lineCoverage: number;
        branchCoverage: number;
        missedLines: number[];
    }>;
    overallCoverage: number;
}

/**
 * Request body for coverage improvement API
 */
export interface ImproveCoverageRequest {
    sourceFile: SourceFile;
    testFile: SourceFile;
    selectedMethods: string[];
    cachedAst?: CachedAstData;
    currentCoverage: JacocoCoverageResult;
    targetCoverage: number;
}

/**
 * Coverage improvement addition info
 */
export interface CoverageAddition {
    testMethod: string;
    targetBranch: string;
    description: string;
}

/**
 * Response from coverage improvement API
 */
export interface ImproveCoverageResponse {
    success: boolean;
    improvedTestCode: string;
    additions: CoverageAddition[];
    expectedCoverageIncrease: number;
}
