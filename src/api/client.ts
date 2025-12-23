import axios, { AxiosInstance, AxiosError } from 'axios';
import { SettingsManager } from '../config/settings';
import {
    GenerateTestRequest,
    GenerateTestResponse,
    GenerateScenariosRequest,
    GenerateScenariosResponse,
    AnalyzeRequest,
    AnalyzeResponse,
    HealthCheckResponse,
    ApiErrorResponse,
    ApiErrorCode
} from './types';
import {
    ApiError,
    ApiKeyError,
    ServerConnectionError,
    TestGenerationError,
    JavaSyntaxError,
    RateLimitError,
    TimeoutError
} from './errors';

/**
 * HTTP client for communicating with the Test Generator API
 */
export class ApiClient {
    private client: AxiosInstance;
    private settings: SettingsManager;

    constructor(settings: SettingsManager) {
        this.settings = settings;
        this.client = this.createClient();

        // Recreate client when settings change
        settings.onDidChange(() => {
            this.client = this.createClient();
        });
    }

    /**
     * Creates a configured axios instance
     */
    private createClient(): AxiosInstance {
        const baseURL = this.settings.getApiUrl();
        const apiKey = this.settings.getApiKey();
        const timeout = this.settings.getTimeout();

        const instance = axios.create({
            baseURL,
            timeout,
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey && { 'X-API-Key': apiKey })
            }
        });

        // Add response interceptor for logging
        instance.interceptors.response.use(
            (response) => response,
            (error) => {
                console.error('[ApiClient] Request failed:', error.message);
                return Promise.reject(error);
            }
        );

        return instance;
    }

    /**
     * Checks if the API server is healthy
     */
    public async healthCheck(): Promise<HealthCheckResponse> {
        try {
            const response = await this.client.get<HealthCheckResponse>('/health');
            return response.data;
        } catch (error) {
            throw this.handleError(error as AxiosError);
        }
    }

    /**
     * Checks if the server is reachable (returns boolean)
     */
    public async isServerReachable(): Promise<boolean> {
        try {
            const response = await this.healthCheck();
            return response.status === 'healthy';
        } catch {
            return false;
        }
    }

    /**
     * Generates a unit test for the given source file
     */
    public async generateTest(request: GenerateTestRequest): Promise<GenerateTestResponse> {
        try {
            const response = await this.client.post<GenerateTestResponse | ApiErrorResponse>(
                '/generate-test',
                request
            );

            const data = response.data;

            if (!data.success) {
                throw ApiError.fromApiError((data as ApiErrorResponse).error);
            }

            return data as GenerateTestResponse;
        } catch (error) {
            throw this.handleError(error as AxiosError);
        }
    }

    /**
     * Generates test scenarios for the given source file
     */
    public async generateScenarios(request: GenerateScenariosRequest): Promise<GenerateScenariosResponse> {
        try {
            const response = await this.client.post<GenerateScenariosResponse | ApiErrorResponse>(
                '/generate-scenarios',
                request
            );

            const data = response.data;

            if (!data.success) {
                throw ApiError.fromApiError((data as ApiErrorResponse).error);
            }

            return data as GenerateScenariosResponse;
        } catch (error) {
            throw this.handleError(error as AxiosError);
        }
    }

    /**
     * Analyzes Java source code
     */
    public async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
        try {
            const response = await this.client.post<AnalyzeResponse>(
                '/analyze',
                request
            );
            return response.data;
        } catch (error) {
            throw this.handleError(error as AxiosError);
        }
    }

    /**
     * Handles axios errors and converts them to appropriate custom errors
     */
    private handleError(error: AxiosError<ApiErrorResponse | unknown>): Error {
        // Network error or no response
        if (!error.response) {
            if (error.code === 'ECONNABORTED') {
                return new TimeoutError('Request timed out. The server might be processing a complex request.');
            }
            if (error.code === 'ECONNREFUSED') {
                return new ServerConnectionError(
                    'Connection refused. Please check if the server is running.',
                    error
                );
            }
            return new ServerConnectionError(
                `Unable to connect to server: ${error.message}`,
                error
            );
        }

        const { status, data } = error.response;
        const apiErrorData = data as ApiErrorResponse | undefined;
        const errorInfo = apiErrorData?.error;

        switch (status) {
            case 401:
                return new ApiKeyError(errorInfo?.message || 'Invalid or expired API key');

            case 429: {
                const retryAfter = parseInt(error.response.headers['retry-after'] || '0');
                return new RateLimitError(
                    errorInfo?.message || 'Rate limit exceeded',
                    retryAfter > 0 ? retryAfter : undefined
                );
            }

            case 400:
                if (errorInfo?.code === ApiErrorCode.INVALID_JAVA_SYNTAX) {
                    const details = errorInfo.details as { line?: number; column?: number } | undefined;
                    return new JavaSyntaxError(
                        errorInfo.message,
                        details?.line,
                        details?.column
                    );
                }
                return new ApiError(
                    errorInfo?.message || 'Invalid request',
                    errorInfo?.code || 'BAD_REQUEST',
                    errorInfo?.requestId
                );

            case 500:
            case 502:
            case 503:
                return new TestGenerationError(
                    errorInfo?.message || 'Server error occurred during test generation',
                    errorInfo?.requestId,
                    errorInfo?.details
                );

            default:
                return new ApiError(
                    errorInfo?.message || `Request failed with status ${status}`,
                    errorInfo?.code || 'UNKNOWN_ERROR',
                    errorInfo?.requestId
                );
        }
    }

    /**
     * Gets the current base URL
     */
    public getBaseUrl(): string {
        return this.client.defaults.baseURL || '';
    }
}
