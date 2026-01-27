import * as vscode from 'vscode';
import { generateWebviewScripts } from './webviewScripts';

/**
 * Generates the HTML content for the sidebar webview
 */
export function generateHtmlTemplate(
    webview: vscode.Webview,
    extensionUri: vscode.Uri,
    nonce: string
): string {
    // Get URI for external CSS file
    const styleUri = webview.asWebviewUri(
        vscode.Uri.joinPath(extensionUri, 'media', 'sidebar.css')
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;">
    <title>Test-AutoEvermation</title>
    <link rel="stylesheet" href="${styleUri}">
</head>
<body>
    <!-- Connection Status -->
    <div class="connection-status" id="connectionStatus">
        <span class="dot unknown" id="connectionDot"></span>
        <span id="connectionText">Not connected</span>
    </div>

    <!-- Server Settings -->
    <div class="section">
        <div class="section-title">Server Settings</div>

        <div class="input-group">
            <label for="apiUrl">API Server URL</label>
            <input type="text" id="apiUrl" placeholder="http://localhost:8000/api/v1">
        </div>

        <div class="input-group">
            <label for="apiKey">API Key</label>
            <input type="password" id="apiKey" placeholder="Enter your API key">
        </div>

        <button class="btn btn-primary" id="btnSave">
            Save Settings
        </button>

        <button class="btn btn-secondary" id="btnTestConnection">
            <span id="testConnectionText">Test Connection</span>
            <span class="spinner hidden" id="testConnectionSpinner"></span>
        </button>
    </div>

    <div class="divider"></div>

    <!-- Generation Options -->
    <div class="section">
        <div class="section-title">Generation Options</div>

        <div class="input-group">
            <label for="testFramework">Test Framework</label>
            <select id="testFramework">
                <option value="junit5">JUnit 5</option>
                <option value="junit4">JUnit 4</option>
            </select>
        </div>

        <div class="input-group">
            <label for="mockingFramework">Mocking Framework</label>
            <select id="mockingFramework">
                <option value="mockito">Mockito</option>
                <option value="easymock">EasyMock</option>
            </select>
        </div>

        <button class="btn btn-secondary" id="btnOpenSettings">
            Open Full Settings
        </button>
    </div>

    <div class="divider"></div>

    <!-- File Selection -->
    <div class="section">
        <div class="section-title">Select Java File</div>

        <!-- File Selection Options -->
        <div class="file-selection-options" id="fileSelectionOptions">
            <button class="btn btn-primary" id="btnBrowseFile">
                <span class="icon">&#8862;</span>
                Browse Java File
            </button>
            <button class="btn btn-secondary" id="btnUseCurrentFile">
                <span class="icon">&#9634;</span>
                Use Current Editor
            </button>
        </div>


        <!-- Selected File Display -->
        <div class="selected-file hidden" id="selectedFile">
            <span class="selected-file-icon">&#9776;</span>
            <div class="selected-file-info">
                <div class="selected-file-name" id="selectedFileName"></div>
                <div class="selected-file-path" id="selectedFilePath"></div>
            </div>
            <button class="selected-file-remove" id="btnRemoveFile" title="Remove">&#10005;</button>
        </div>

        <!-- AST Analysis Section (shown after file is selected) -->
        <div id="astSection" class="hidden">
            <div class="section-title">AST Analysis</div>

            <!-- AST Status -->
            <div class="ast-status" id="astStatus">
                <span class="ast-status-icon" id="astStatusIcon">&#9888;</span>
                <span class="ast-status-text" id="astStatusText">No cached analysis</span>
            </div>

            <!-- Cached AST Info Box -->
            <div class="ast-info-box hidden" id="astInfoBox">
                <div class="ast-info-row">
                    <span class="ast-info-label">Methods:</span>
                    <span class="ast-info-value" id="astMethodCount">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Dependencies:</span>
                    <span class="ast-info-value" id="astDependencies">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Annotations:</span>
                    <span class="ast-info-value" id="astAnnotations">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Complexity:</span>
                    <span class="ast-info-value" id="astComplexity">-</span>
                </div>
                <div class="ast-info-row">
                    <span class="ast-info-label">Analyzed:</span>
                    <span class="ast-info-value" id="astAnalyzedAt">-</span>
                </div>
            </div>

            <!-- AST Analyze Button -->
            <button class="btn btn-primary" id="btnAnalyzeAst">
                <span class="icon">&#128269;</span>
                <span id="analyzeAstText">Analyze AST</span>
                <span class="spinner hidden" id="analyzeAstSpinner"></span>
            </button>

            <!-- AST Selected Indicator -->
            <div class="ast-selected hidden" id="astSelectedIndicator">
                <span class="ast-selected-icon">&#9989;</span>
                <span class="ast-selected-text">AST analysis ready</span>
                <button class="ast-selected-change" id="btnViewDetails">View Details</button>
                <button class="ast-selected-change" id="btnChangeAst">Re-analyze</button>
            </div>

            <!-- AST Details Panel (collapsible) -->
            <div class="ast-details-panel hidden" id="astDetailsPanel">
                <div class="ast-details-header">
                    <span class="ast-details-title">Analysis Details</span>
                    <button class="ast-details-close" id="btnCloseDetails">&times;</button>
                </div>
                <div class="ast-details-content">
                    <!-- Class Info Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="classInfo">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Class Information</span>
                        </div>
                        <div class="ast-detail-section-content" id="classInfoContent">
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Class Name:</span>
                                <span class="ast-detail-value" id="detailClassName">-</span>
                            </div>
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Package:</span>
                                <span class="ast-detail-value" id="detailPackageName">-</span>
                            </div>
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Annotations:</span>
                                <div class="ast-detail-tags" id="detailClassAnnotations"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Methods Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="methods">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Methods (<span id="detailMethodCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="methodsContent">
                            <div class="ast-method-list" id="detailMethodList"></div>
                        </div>
                    </div>

                    <!-- Fields Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="fields">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Fields (<span id="detailFieldCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="fieldsContent">
                            <div class="ast-field-list" id="detailFieldList"></div>
                        </div>
                    </div>

                    <!-- Injected Dependencies Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="injected">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Injected Dependencies (<span id="detailInjectedCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="injectedContent">
                            <div class="ast-injected-list" id="detailInjectedList"></div>
                        </div>
                    </div>

                    <!-- Imports Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="imports">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Imports (<span id="detailImportCount">0</span>)</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="importsContent">
                            <div class="ast-import-list" id="detailImportList"></div>
                        </div>
                    </div>

                    <!-- Complexity Section -->
                    <div class="ast-detail-section">
                        <div class="ast-detail-section-header" data-section="complexity">
                            <span class="ast-detail-toggle">&#9654;</span>
                            <span class="ast-detail-section-title">Complexity Analysis</span>
                        </div>
                        <div class="ast-detail-section-content hidden" id="complexityContent">
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Total Cyclomatic:</span>
                                <span class="ast-detail-value" id="detailTotalComplexity">-</span>
                            </div>
                            <div class="ast-detail-item">
                                <span class="ast-detail-label">Lines of Code:</span>
                                <span class="ast-detail-value" id="detailLinesOfCode">-</span>
                            </div>
                            <div class="ast-complexity-list" id="detailComplexityList"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Method Selection (shown after AST is ready) -->
        <div id="methodSelectionSection" class="hidden">
            <div class="method-selection-header">
                <span class="section-title">Select Methods</span>
                <div class="method-selection-actions">
                    <span class="link-btn" id="btnSelectAll">All</span>
                    <span class="link-btn" id="btnDeselectAll">None</span>
                </div>
            </div>
            <div class="method-list" id="methodList">
                <div class="method-loading">
                    <span class="spinner"></span> Loading methods...
                </div>
            </div>
        </div>

        <!-- Step 1: Check Testability -->
        <button class="btn btn-secondary" id="btnCheckTestability" disabled>
            <span class="icon">&#9989;</span>
            <span id="checkTestabilityText">Check Testability</span>
            <span class="spinner hidden" id="testabilitySpinner"></span>
        </button>

        <!-- Testability Result Section -->
        <div id="testabilitySection" class="hidden">
            <div class="testability-result" id="testabilityResult">
                <div class="testability-header" id="testabilityHeader">
                    <span class="testability-icon" id="testabilityIcon">&#10004;</span>
                    <span class="testability-text" id="testabilityText">Testable</span>
                </div>
                <!-- Refactoring Advice (shown if not testable) -->
                <div class="refactoring-section hidden" id="refactoringSection">
                    <div class="refactoring-header">Refactoring Suggestions</div>
                    <div class="refactoring-list" id="refactoringList"></div>
                </div>
            </div>
        </div>

        <!-- Step 2: Generate Scenarios -->
        <button class="btn btn-primary" id="btnGenerateScenarios" disabled>
            <span class="icon">&#8801;</span>
            <span id="generateScenariosText">Generate Scenarios</span>
            <span class="spinner hidden" id="scenarioSpinner"></span>
        </button>

        <!-- Scenario Editor (hidden until scenarios are generated) -->
        <div id="scenarioSection" class="hidden">
            <div class="scenario-header">
                <span class="section-title">Test Scenarios</span>
                <span class="scenario-status" id="scenarioStatus">Draft</span>
            </div>
            <textarea id="scenarioEditor" class="scenario-editor" placeholder="Test scenarios will appear here..."></textarea>
            <div class="feedback-area">
                <textarea id="feedbackInput" class="feedback-input" rows="2"
                    placeholder="개선 피드백 (선택사항)&#10;예: edge case 추가, null 체크 시나리오 포함, 예외 상황 테스트 등"></textarea>
            </div>
            <div class="scenario-actions">
                <button class="btn btn-primary" id="btnApproveScenarios">
                    <span class="icon">&#10004;</span>
                    Approve
                </button>
                <button class="btn btn-secondary" id="btnRegenerateScenarios">
                    <span class="icon">&#8635;</span>
                    Regenerate
                </button>
            </div>
        </div>

        <!-- Step 2: Generate Test (enabled after approval) -->
        <button class="btn btn-success" id="btnGenerateSelected" disabled>
            <span class="icon">&#9881;</span>
            Generate Test
        </button>
        <button class="btn btn-danger hidden" id="btnStopAutoTest">
            <span class="icon">&#9632;</span>
            Stop
        </button>
    </div>

    <div class="divider"></div>

    <!-- Run Test Section -->
    <div class="section">
        <div class="section-title">Run Test</div>

        <!-- Test File Input -->
        <div class="input-group">
            <label for="testClassName">Test Class Name</label>
            <input type="text" id="testClassName" placeholder="e.g., UserServiceTest">
        </div>

        <button class="btn btn-primary" id="btnRunTest">
            <span class="icon">&#9654;</span>
            <span id="runTestText">Run Test</span>
            <span class="spinner hidden" id="runTestSpinner"></span>
        </button>

        <button class="btn btn-secondary" id="btnRunAllTests">
            <span class="icon">&#9654;</span>
            Run All Tests
        </button>

        <!-- Test Result Area -->
        <div id="testResultArea" class="hidden">
            <div class="test-result" id="testResult"></div>
        </div>
    </div>

    <div class="divider"></div>

    <!-- Coverage Analysis Section -->
    <div class="section">
        <div class="section-title">Coverage Analysis</div>

        <!-- Coverage Target Setting -->
        <div class="coverage-target-container">
            <label for="coverageTarget" class="coverage-label">
                <span class="label-icon">🎯</span>
                <span>Target Coverage</span>
            </label>
            <div class="coverage-input-wrapper">
                <input
                    type="number"
                    id="coverageTarget"
                    class="coverage-input"
                    min="0"
                    max="100"
                    value="80"
                    step="5"
                    placeholder="80"
                >
                <span class="coverage-unit">%</span>
            </div>
            <div class="coverage-hint">
                <span class="hint-icon">💡</span>
                <span>커버리지 목표를 설정하세요 (0-100%)</span>
            </div>
        </div>

        <button class="btn btn-primary" id="btnRunWithCoverage">
            <span class="icon">&#128202;</span>
            <span id="runWithCoverageText">Run with Coverage</span>
            <span class="spinner hidden" id="coverageSpinner"></span>
        </button>

        <button class="btn btn-secondary" id="btnOpenCoverageReport">
            <span class="icon">&#128196;</span>
            Open Report
        </button>

        <!-- Coverage Result -->
        <div id="coverageResultSection" class="hidden">
            <div class="coverage-result" id="coverageResult">
                <div class="coverage-header" id="coverageHeader">
                    <span class="coverage-percentage" id="coveragePercentage">0%</span>
                    <span class="coverage-status" id="coverageStatus">Below Target</span>
                </div>
                <div class="coverage-bars">
                    <div class="coverage-bar-item">
                        <span class="coverage-bar-label">Line</span>
                        <div class="coverage-bar">
                            <div class="coverage-bar-fill" id="lineCoverageBar"></div>
                        </div>
                        <span class="coverage-bar-value" id="lineCoverageValue">0%</span>
                    </div>
                    <div class="coverage-bar-item">
                        <span class="coverage-bar-label">Branch</span>
                        <div class="coverage-bar">
                            <div class="coverage-bar-fill" id="branchCoverageBar"></div>
                        </div>
                        <span class="coverage-bar-value" id="branchCoverageValue">0%</span>
                    </div>
                </div>
                <!-- Method Coverage Details -->
                <div class="method-coverage-section hidden" id="methodCoverageSection">
                    <div class="method-coverage-header">Method Coverage</div>
                    <div class="method-coverage-list" id="methodCoverageList"></div>
                </div>
            </div>

            <!-- Improve Coverage Button (shown when below target) -->
            <button class="btn btn-warning hidden" id="btnImproveCoverage">
                <span class="icon">&#8679;</span>
                Improve Coverage
            </button>

            <!-- Coverage Improvement Result -->
            <div class="improvement-result hidden" id="improvementResultSection">
                <div class="improvement-header">
                    <span class="improvement-title">Coverage Improvement Suggested</span>
                    <span class="improvement-increase" id="improvementIncrease">+0%</span>
                </div>
                <div class="improvement-additions" id="improvementAdditions">
                    <!-- List of suggested additions -->
                </div>
                <div class="improvement-actions">
                    <button class="btn btn-primary" id="btnApplyImprovement">
                        <span class="icon">&#10004;</span>
                        Apply Changes
                    </button>
                    <button class="btn btn-secondary" id="btnRerunCoverage">
                        <span class="icon">&#8635;</span>
                        Re-run Coverage
                    </button>
                </div>
            </div>
        </div>
    </div>

    <!-- Message Area -->
    <div id="messageArea" class="hidden"></div>

    <script nonce="${nonce}">
${generateWebviewScripts()}
    </script>
</body>
</html>`;
}
