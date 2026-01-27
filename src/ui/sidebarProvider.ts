import * as vscode from 'vscode';
import { ApiClient } from '../api/client';
import { SettingsManager } from '../config/settings';
import { JavaAstAnalyzer, FullAnalysisResult } from '../services/javaAstAnalyzer';
import {
    HandlerContext,
    SettingsHandler,
    FileHandler,
    AstHandler,
    TestabilityHandler,
    ScenarioHandler,
    TestRunnerHandler,
    CoverageHandler
} from './handlers';
import { generateHtmlTemplate } from './webview/htmlTemplate';
import { getNonce } from './utils/securityUtils';

/**
 * Provides the sidebar webview panel
 */
export class SidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'javaTestGenerator.sidebar';

    private _view?: vscode.WebviewView;
    private _apiClient: ApiClient;
    private _settings: SettingsManager;
    private _extensionUri: vscode.Uri;
    private _javaAstAnalyzer: JavaAstAnalyzer;

    // Handlers (Dependency Injection)
    private _settingsHandler: SettingsHandler;
    private _fileHandler: FileHandler;
    private _astHandler: AstHandler;
    private _testabilityHandler: TestabilityHandler;
    private _scenarioHandler: ScenarioHandler;
    private _testRunnerHandler: TestRunnerHandler;
    private _coverageHandler: CoverageHandler;

    constructor(
        extensionUri: vscode.Uri,
        apiClient: ApiClient,
        settings: SettingsManager
    ) {
        this._extensionUri = extensionUri;
        this._apiClient = apiClient;
        this._settings = settings;
        this._javaAstAnalyzer = new JavaAstAnalyzer();

        // Initialize handlers
        this._settingsHandler = new SettingsHandler();
        this._fileHandler = new FileHandler();
        this._astHandler = new AstHandler();
        this._testabilityHandler = new TestabilityHandler(this._astHandler);
        this._scenarioHandler = new ScenarioHandler(this._astHandler);
        this._testRunnerHandler = new TestRunnerHandler();
        this._coverageHandler = new CoverageHandler(this._astHandler, this._testRunnerHandler);

        // Set up coverage callback for auto-coverage after tests pass
        this._testRunnerHandler.setCoverageCallback(async (testClassName: string) => {
            const context = this._createContext();
            await this._coverageHandler.runTestWithCoverage(
                testClassName,
                undefined,
                undefined,
                undefined,
                false,
                0,
                undefined,
                context
            );
        });
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlContent(webviewView.webview);

        // Handle messages from webview
        this._setupMessageHandlers(webviewView);

        // Send initial settings
        const context = this._createContext();
        this._settingsHandler.sendCurrentSettings(context);
    }

    /**
     * Creates the handler context for message handling
     */
    private _createContext(): HandlerContext {
        return {
            view: this._view,
            apiClient: this._apiClient,
            settings: this._settings,
            javaAstAnalyzer: this._javaAstAnalyzer,
            postMessage: (message: any) => {
                this._view?.webview.postMessage(message);
            }
        };
    }

    /**
     * Sets up message handlers for webview communication
     */
    private _setupMessageHandlers(webviewView: vscode.WebviewView): void {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            const context = this._createContext();

            switch (message.command) {
                // Settings commands
                case 'saveSettings':
                    await this._settingsHandler.saveSettings(message.apiUrl, message.apiKey, context);
                    break;
                case 'testConnection':
                    await this._settingsHandler.testConnection(context);
                    break;
                case 'getSettings':
                    await this._settingsHandler.sendCurrentSettings(context);
                    break;
                case 'openSettings':
                    vscode.commands.executeCommand('workbench.action.openSettings', 'javaTestGenerator');
                    break;

                // File commands
                case 'selectFile':
                    await this._fileHandler.selectFile(context);
                    break;
                case 'useCurrentFile':
                    await this._fileHandler.useCurrentFile(context);
                    break;
                case 'handleDroppedUri':
                    await this._fileHandler.handleDroppedUri(message.uri, context);
                    break;
                case 'extractMethods':
                    await this._fileHandler.extractMethods(message.filePath, context);
                    break;

                // AST commands
                case 'checkAstCache':
                    await this._astHandler.checkAstCache(message.filePath, context);
                    break;
                case 'analyzeAst':
                    await this._astHandler.analyzeAst(message.filePath, context);
                    break;
                case 'reanalyzeAst':
                    await this._astHandler.reanalyzeAst(message.filePath, context);
                    break;
                case 'useCachedAst':
                    await this._astHandler.useCachedAst(message.filePath, context);
                    break;

                // Testability commands
                case 'checkTestability':
                    await this._testabilityHandler.checkTestability(
                        message.filePath,
                        message.selectedMethods,
                        context
                    );
                    break;

                // Scenario commands
                case 'generateScenarios':
                    await this._scenarioHandler.generateScenarios(
                        message.filePath,
                        message.selectedMethods,
                        context
                    );
                    break;
                case 'regenerateScenarios':
                    await this._scenarioHandler.regenerateScenarios(
                        message.filePath,
                        message.selectedMethods,
                        message.previousScenarios,
                        message.feedback,
                        context
                    );
                    break;

                // Test commands
                case 'generateTest':
                    await vscode.commands.executeCommand('javaTestGenerator.generateTest');
                    break;
                case 'stopAutoTest':
                    this._testRunnerHandler.stopAutoTest(context);
                    break;
                case 'generateTestForFile':
                    // Fire-and-forget: don't block message queue so stopAutoTest can be processed
                    this._testRunnerHandler.generateTestForFile(
                        message.filePath,
                        message.scenarios,
                        message.selectedMethods,
                        message.autoRunTest || false,
                        context
                    );
                    break;
                case 'runTest':
                    await this._testRunnerHandler.runTest(message.testClassName, context);
                    break;
                case 'runAllTests':
                    await this._testRunnerHandler.runAllTests(context);
                    break;
                case 'regenerateTestWithError':
                    await this._testRunnerHandler.regenerateTestWithError(
                        message.filePath,
                        message.testFilePath,
                        message.errorMessage,
                        message.testOutput,
                        message.scenarios,
                        message.selectedMethods,
                        message.retryCount,
                        context
                    );
                    break;

                // Coverage commands
                case 'runTestWithCoverage':
                    await this._coverageHandler.runTestWithCoverage(
                        message.testClassName,
                        message.sourceFilePath,
                        message.testFilePath,
                        message.selectedMethods,
                        message.autoImprove || false,
                        0,
                        message.coverageTarget,
                        context
                    );
                    break;
                case 'checkJacocoConfig':
                    await this._coverageHandler.checkJacocoConfig(context);
                    break;
                case 'openCoverageReport':
                    await this._coverageHandler.openCoverageReport(context);
                    break;
                case 'improveCoverage':
                    await this._coverageHandler.improveCoverage(
                        message.sourceFilePath,
                        message.testFilePath,
                        message.selectedMethods,
                        message.currentCoverage,
                        message.targetCoverage,
                        context
                    );
                    break;
                case 'applyImprovement':
                    await this._coverageHandler.applyImprovement(
                        message.testFilePath,
                        message.testCode,
                        context
                    );
                    break;
            }
        });
    }

    /**
     * Refreshes the webview content
     */
    public refresh(): void {
        if (this._view) {
            this._view.webview.html = this._getHtmlContent(this._view.webview);
            const context = this._createContext();
            this._settingsHandler.sendCurrentSettings(context);
        }
    }

    /**
     * Gets the currently analyzed AST data for API requests
     */
    public async getSelectedAstData(filePath: string): Promise<{ filePath: string; ast: FullAnalysisResult } | null> {
        const context = this._createContext();
        return this._astHandler.getSelectedAstData(filePath, context);
    }

    /**
     * Generates HTML content for the webview
     */
    private _getHtmlContent(webview: vscode.Webview): string {
        const nonce = getNonce();
        return generateHtmlTemplate(webview, this._extensionUri, nonce);
    }
}
