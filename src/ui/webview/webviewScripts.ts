/**
 * Generates the JavaScript code for the sidebar webview
 */
export function generateWebviewScripts(): string {
    return `
        const vscode = acquireVsCodeApi();

        // Elements
        const apiUrlInput = document.getElementById('apiUrl');
        const apiKeyInput = document.getElementById('apiKey');
        const testFrameworkSelect = document.getElementById('testFramework');
        const mockingFrameworkSelect = document.getElementById('mockingFramework');
        const btnSave = document.getElementById('btnSave');
        const btnTestConnection = document.getElementById('btnTestConnection');
        const btnOpenSettings = document.getElementById('btnOpenSettings');
        const connectionDot = document.getElementById('connectionDot');
        const connectionText = document.getElementById('connectionText');
        const testConnectionText = document.getElementById('testConnectionText');
        const testConnectionSpinner = document.getElementById('testConnectionSpinner');
        const messageArea = document.getElementById('messageArea');

        // File selection elements
        const fileSelectionOptions = document.getElementById('fileSelectionOptions');
        const btnBrowseFile = document.getElementById('btnBrowseFile');
        const btnUseCurrentFile = document.getElementById('btnUseCurrentFile');
        const selectedFile = document.getElementById('selectedFile');
        const selectedFileName = document.getElementById('selectedFileName');
        const selectedFilePath = document.getElementById('selectedFilePath');
        const btnRemoveFile = document.getElementById('btnRemoveFile');
        const btnGenerateScenarios = document.getElementById('btnGenerateScenarios');
        const generateScenariosText = document.getElementById('generateScenariosText');
        const scenarioSpinner = document.getElementById('scenarioSpinner');
        const scenarioSection = document.getElementById('scenarioSection');
        const scenarioEditor = document.getElementById('scenarioEditor');
        const scenarioStatus = document.getElementById('scenarioStatus');
        const btnApproveScenarios = document.getElementById('btnApproveScenarios');
        const btnRegenerateScenarios = document.getElementById('btnRegenerateScenarios');
        const btnGenerateSelected = document.getElementById('btnGenerateSelected');
        const feedbackInput = document.getElementById('feedbackInput');
        const btnStopAutoTest = document.getElementById('btnStopAutoTest');

        // AST Analysis elements
        const astSection = document.getElementById('astSection');
        const astStatus = document.getElementById('astStatus');
        const astStatusIcon = document.getElementById('astStatusIcon');
        const astStatusText = document.getElementById('astStatusText');
        const astInfoBox = document.getElementById('astInfoBox');
        const astMethodCount = document.getElementById('astMethodCount');
        const astDependencies = document.getElementById('astDependencies');
        const astAnnotations = document.getElementById('astAnnotations');
        const astComplexity = document.getElementById('astComplexity');
        const astAnalyzedAt = document.getElementById('astAnalyzedAt');
        const btnAnalyzeAst = document.getElementById('btnAnalyzeAst');
        const analyzeAstText = document.getElementById('analyzeAstText');
        const analyzeAstSpinner = document.getElementById('analyzeAstSpinner');
        const astSelectedIndicator = document.getElementById('astSelectedIndicator');
        const btnChangeAst = document.getElementById('btnChangeAst');
        const btnViewDetails = document.getElementById('btnViewDetails');
        const astDetailsPanel = document.getElementById('astDetailsPanel');
        const btnCloseDetails = document.getElementById('btnCloseDetails');

        // AST Details panel elements
        const detailClassName = document.getElementById('detailClassName');
        const detailPackageName = document.getElementById('detailPackageName');
        const detailClassAnnotations = document.getElementById('detailClassAnnotations');
        const detailMethodCount = document.getElementById('detailMethodCount');
        const detailMethodList = document.getElementById('detailMethodList');
        const detailFieldCount = document.getElementById('detailFieldCount');
        const detailFieldList = document.getElementById('detailFieldList');
        const detailInjectedCount = document.getElementById('detailInjectedCount');
        const detailInjectedList = document.getElementById('detailInjectedList');
        const detailImportCount = document.getElementById('detailImportCount');
        const detailImportList = document.getElementById('detailImportList');
        const detailTotalComplexity = document.getElementById('detailTotalComplexity');
        const detailLinesOfCode = document.getElementById('detailLinesOfCode');
        const detailComplexityList = document.getElementById('detailComplexityList');

        // Method selection elements
        const methodSelectionSection = document.getElementById('methodSelectionSection');
        const methodList = document.getElementById('methodList');
        const btnSelectAll = document.getElementById('btnSelectAll');
        const btnDeselectAll = document.getElementById('btnDeselectAll');

        // Testability check elements
        const btnCheckTestability = document.getElementById('btnCheckTestability');
        const checkTestabilityText = document.getElementById('checkTestabilityText');
        const testabilitySpinner = document.getElementById('testabilitySpinner');
        const testabilitySection = document.getElementById('testabilitySection');
        const testabilityResult = document.getElementById('testabilityResult');
        const testabilityHeader = document.getElementById('testabilityHeader');
        const testabilityIcon = document.getElementById('testabilityIcon');
        const testabilityText = document.getElementById('testabilityText');
        const refactoringSection = document.getElementById('refactoringSection');
        const refactoringList = document.getElementById('refactoringList');

        // Test execution elements
        const testClassNameInput = document.getElementById('testClassName');
        const btnRunTest = document.getElementById('btnRunTest');
        const btnRunAllTests = document.getElementById('btnRunAllTests');
        const runTestText = document.getElementById('runTestText');
        const runTestSpinner = document.getElementById('runTestSpinner');
        const testResultArea = document.getElementById('testResultArea');
        const testResult = document.getElementById('testResult');

        // Coverage elements
        const coverageTargetInput = document.getElementById('coverageTarget');
        const btnRunWithCoverage = document.getElementById('btnRunWithCoverage');
        const runWithCoverageText = document.getElementById('runWithCoverageText');
        const coverageSpinner = document.getElementById('coverageSpinner');
        const btnOpenCoverageReport = document.getElementById('btnOpenCoverageReport');
        const coverageResultSection = document.getElementById('coverageResultSection');
        const coverageResult = document.getElementById('coverageResult');
        const coverageHeader = document.getElementById('coverageHeader');
        const coveragePercentage = document.getElementById('coveragePercentage');
        const coverageStatus = document.getElementById('coverageStatus');
        const lineCoverageBar = document.getElementById('lineCoverageBar');
        const lineCoverageValue = document.getElementById('lineCoverageValue');
        const branchCoverageBar = document.getElementById('branchCoverageBar');
        const branchCoverageValue = document.getElementById('branchCoverageValue');
        const methodCoverageSection = document.getElementById('methodCoverageSection');
        const methodCoverageList = document.getElementById('methodCoverageList');
        const btnImproveCoverage = document.getElementById('btnImproveCoverage');
        const improvementResultSection = document.getElementById('improvementResultSection');
        const improvementIncrease = document.getElementById('improvementIncrease');
        const improvementAdditions = document.getElementById('improvementAdditions');
        const btnApplyImprovement = document.getElementById('btnApplyImprovement');
        const btnRerunCoverage = document.getElementById('btnRerunCoverage');

        // State
        let currentFilePath = null;
        let currentTestClassName = null;
        let currentTestFilePath = null;
        let scenariosApproved = false;
        let currentScenarios = '';
        let availableMethods = [];
        let selectedMethods = [];
        let cachedAstData = null;
        let selectedAstData = null;
        let isAstReady = false;
        let isTestabilityChecked = false;
        let isTestable = false;
        let currentCoverage = null;
        let targetCoverage = 80;
        let improvedTestCode = null;
        let improvedTestFilePath = null;

        // Request initial settings
        vscode.postMessage({ command: 'getSettings' });

        // Event Listeners
        btnSave.addEventListener('click', () => {
            vscode.postMessage({
                command: 'saveSettings',
                apiUrl: apiUrlInput.value,
                apiKey: apiKeyInput.value
            });
        });

        btnTestConnection.addEventListener('click', () => {
            vscode.postMessage({ command: 'testConnection' });
        });

        btnUseCurrentFile.addEventListener('click', () => {
            vscode.postMessage({ command: 'useCurrentFile' });
        });

        btnOpenSettings.addEventListener('click', () => {
            vscode.postMessage({ command: 'openSettings' });
        });

        // File selection - browse button
        btnBrowseFile.addEventListener('click', () => {
            vscode.postMessage({ command: 'selectFile' });
        });

        // Remove selected file
        btnRemoveFile.addEventListener('click', () => {
            currentFilePath = null;
            currentScenarios = '';
            scenariosApproved = false;
            availableMethods = [];
            selectedMethods = [];
            selectedFile.classList.add('hidden');
            fileSelectionOptions.classList.remove('hidden');
            astSection.classList.add('hidden');
            methodSelectionSection.classList.add('hidden');
            testabilitySection.classList.add('hidden');
            scenarioSection.classList.add('hidden');
            btnCheckTestability.disabled = true;
            btnGenerateScenarios.disabled = true;
            btnGenerateSelected.disabled = true;
            // Reset AST and testability state
            resetAstState();
            resetTestabilityState();
        });

        // Method selection helpers
        function renderMethods(methods) {
            if (methods.length === 0) {
                methodList.innerHTML = '<div class="method-loading">No methods found</div>';
                return;
            }

            methodList.innerHTML = methods.map((method, index) =>
                '<div class="method-item">' +
                '<input type="checkbox" id="method_' + index + '" checked>' +
                '<label for="method_' + index + '">' + method.name + '()</label>' +
                '</div>'
            ).join('');

            // Add change listeners
            methods.forEach((method, index) => {
                const checkbox = document.getElementById('method_' + index);
                checkbox.addEventListener('change', () => {
                    updateSelectedMethods();
                });
            });

            updateSelectedMethods();
        }

        function updateSelectedMethods() {
            selectedMethods = [];
            availableMethods.forEach((method, index) => {
                const checkbox = document.getElementById('method_' + index);
                if (checkbox && checkbox.checked) {
                    selectedMethods.push(method.name);
                }
            });

            // Enable/disable check testability based on selection
            btnCheckTestability.disabled = selectedMethods.length === 0;

            // Reset testability state when methods change
            if (isTestabilityChecked) {
                isTestabilityChecked = false;
                isTestable = false;
                testabilitySection.classList.add('hidden');
                btnGenerateScenarios.disabled = true;
            }
        }

        // Select all methods
        btnSelectAll.addEventListener('click', () => {
            availableMethods.forEach((_, index) => {
                const checkbox = document.getElementById('method_' + index);
                if (checkbox) checkbox.checked = true;
            });
            updateSelectedMethods();
        });

        // Deselect all methods
        btnDeselectAll.addEventListener('click', () => {
            availableMethods.forEach((_, index) => {
                const checkbox = document.getElementById('method_' + index);
                if (checkbox) checkbox.checked = false;
            });
            updateSelectedMethods();
        });

        // AST Analysis: Analyze button (when no cache)
        btnAnalyzeAst.addEventListener('click', () => {
            if (currentFilePath) {
                vscode.postMessage({
                    command: 'analyzeAst',
                    filePath: currentFilePath
                });
            }
        });

        // AST Analysis: Change button (go back to re-analyze)
        btnChangeAst.addEventListener('click', () => {
            isAstReady = false;
            selectedAstData = null;
            astSelectedIndicator.classList.add('hidden');
            astDetailsPanel.classList.add('hidden');
            methodSelectionSection.classList.add('hidden');
            btnGenerateScenarios.disabled = true;

            // Show Analyze button again (no caching)
            btnAnalyzeAst.classList.remove('hidden');
        });

        // AST Analysis: View Details button
        btnViewDetails.addEventListener('click', () => {
            if (selectedAstData && selectedAstData.ast) {
                renderAstDetails(selectedAstData.ast);
                astDetailsPanel.classList.remove('hidden');
            }
        });

        // AST Analysis: Close Details button
        btnCloseDetails.addEventListener('click', () => {
            astDetailsPanel.classList.add('hidden');
        });

        // AST Details: Section toggle (collapsible accordion)
        document.querySelectorAll('.ast-detail-section-header').forEach(header => {
            header.addEventListener('click', () => {
                const section = header.getAttribute('data-section');
                const content = document.getElementById(section + 'Content');
                const toggle = header.querySelector('.ast-detail-toggle');

                if (content) {
                    const isHidden = content.classList.contains('hidden');
                    content.classList.toggle('hidden');
                    header.classList.toggle('expanded', isHidden);
                }
            });
        });

        // Helper: Render AST Details
        function renderAstDetails(ast) {
            // Class Info
            detailClassName.textContent = ast.className || '-';
            detailPackageName.textContent = ast.packageName || '-';

            // Class Annotations
            detailClassAnnotations.innerHTML = '';
            if (ast.classAnnotations && ast.classAnnotations.length > 0) {
                ast.classAnnotations.forEach(ann => {
                    const tag = document.createElement('span');
                    tag.className = 'ast-detail-tag';
                    tag.textContent = ann;
                    detailClassAnnotations.appendChild(tag);
                });
            } else {
                detailClassAnnotations.innerHTML = '<span class="ast-empty-state">No annotations</span>';
            }

            // Methods
            detailMethodCount.textContent = ast.methods ? ast.methods.length : 0;
            detailMethodList.innerHTML = '';
            if (ast.methods && ast.methods.length > 0) {
                ast.methods.forEach(method => {
                    const item = document.createElement('div');
                    item.className = 'ast-method-item';

                    // Support both old (name) and new (methodName) property names
                    const methodName = method.methodName || method.name || 'unknown';
                    const methodSignature = method.methodSignature || method.signature || '';
                    const complexity = ast.complexity?.methodComplexities?.[methodName] || method.complexity || 1;
                    const complexityClass = complexity > 10 ? 'high' : (complexity > 5 ? 'medium' : '');

                    // Determine modifiers
                    let modifiers = method.modifiers || [];
                    if (modifiers.length === 0) {
                        if (ast.publicMethods?.includes(methodName)) modifiers = ['public'];
                        else if (ast.privateMethods?.includes(methodName)) modifiers = ['private'];
                        else if (ast.protectedMethods?.includes(methodName)) modifiers = ['protected'];
                    }

                    item.innerHTML = \`
                        <div class="ast-method-name">\${methodName}</div>
                        <div class="ast-method-signature">\${methodSignature}</div>
                        <div class="ast-method-meta">
                            \${modifiers.map(m => \`<span class="ast-method-meta-item \${m}">\${m}</span>\`).join('')}
                            <span class="ast-method-meta-item">\${method.returnType || 'void'}</span>
                            <span class="ast-method-meta-item complexity \${complexityClass}">CC: \${complexity}</span>
                        </div>
                    \`;
                    detailMethodList.appendChild(item);
                });
            } else {
                detailMethodList.innerHTML = '<div class="ast-empty-state">No methods found</div>';
            }

            // Fields
            detailFieldCount.textContent = ast.fields ? ast.fields.length : 0;
            detailFieldList.innerHTML = '';
            if (ast.fields && ast.fields.length > 0) {
                ast.fields.forEach(field => {
                    const item = document.createElement('div');
                    item.className = 'ast-field-item';
                    item.innerHTML = \`
                        <div class="ast-field-name">\${field.name}</div>
                        <div class="ast-field-meta">
                            <span class="ast-field-meta-item">\${field.type}</span>
                            \${field.annotations?.map(a => \`<span class="ast-detail-tag di">\${a}</span>\`).join('') || ''}
                        </div>
                    \`;
                    detailFieldList.appendChild(item);
                });
            } else {
                detailFieldList.innerHTML = '<div class="ast-empty-state">No fields found</div>';
            }

            // Injected Dependencies
            const injectedFields = ast.injectedFields || [];
            detailInjectedCount.textContent = injectedFields.length;
            detailInjectedList.innerHTML = '';
            if (injectedFields.length > 0) {
                injectedFields.forEach(field => {
                    const item = document.createElement('div');
                    item.className = 'ast-injected-item';
                    item.innerHTML = \`
                        <div class="ast-injected-name">\${field.name}</div>
                        <div class="ast-injected-type">\${field.type}</div>
                        <div class="ast-injected-annotations">
                            \${field.annotations?.map(a => \`<span class="ast-detail-tag di">\${a}</span>\`).join('') || ''}
                        </div>
                    \`;
                    detailInjectedList.appendChild(item);
                });
            } else {
                detailInjectedList.innerHTML = '<div class="ast-empty-state">No DI fields (@Autowired, @Inject, etc.)</div>';
            }

            // Imports
            const imports = ast.imports || [];
            detailImportCount.textContent = imports.length;
            detailImportList.innerHTML = '';
            if (imports.length > 0) {
                imports.forEach(imp => {
                    const item = document.createElement('div');
                    let importClass = 'ast-import-item';
                    if (imp.startsWith('java.') || imp.startsWith('javax.')) {
                        importClass += ' java';
                    } else if (imp.startsWith('org.springframework')) {
                        importClass += ' spring';
                    } else {
                        importClass += ' project';
                    }
                    item.className = importClass;
                    item.textContent = imp;
                    detailImportList.appendChild(item);
                });
            } else {
                detailImportList.innerHTML = '<div class="ast-empty-state">No imports</div>';
            }

            // Complexity
            if (ast.complexity) {
                detailTotalComplexity.textContent = ast.complexity.cyclomaticComplexity || 0;
                detailLinesOfCode.textContent = ast.complexity.linesOfCode || 0;

                detailComplexityList.innerHTML = '';
                const methodComplexities = ast.complexity.methodComplexities || {};
                const sortedMethods = Object.entries(methodComplexities)
                    .sort((a, b) => b[1] - a[1]); // Sort by complexity descending

                if (sortedMethods.length > 0) {
                    sortedMethods.forEach(([name, complexity]) => {
                        const item = document.createElement('div');
                        item.className = 'ast-complexity-item';
                        const complexityClass = complexity > 10 ? 'high' : (complexity > 5 ? 'medium' : 'low');
                        item.innerHTML = \`
                            <span class="ast-complexity-method">\${name}</span>
                            <span class="ast-complexity-value \${complexityClass}">\${complexity}</span>
                        \`;
                        detailComplexityList.appendChild(item);
                    });
                }
            }
        }

        // Helper: Show AST info in the info box
        function showAstInfo(astData) {
            if (!astData || !astData.ast) return;

            const ast = astData.ast;
            astMethodCount.textContent = ast.methodCount + ' (public: ' + ast.publicMethods.length + ')';
            astDependencies.textContent = ast.dependencies.length > 0 ? ast.dependencies.slice(0, 3).join(', ') + (ast.dependencies.length > 3 ? '...' : '') : '-';
            astAnnotations.textContent = ast.annotations.length > 0 ? ast.annotations.join(', ') : '-';
            astComplexity.textContent = 'CC: ' + ast.complexity.cyclomaticComplexity + ', LOC: ' + ast.complexity.linesOfCode;

            // Format date
            const analyzedDate = new Date(astData.analyzedAt);
            astAnalyzedAt.textContent = analyzedDate.toLocaleString();

            astInfoBox.classList.remove('hidden');
        }

        // Helper: Show AST selected state
        function showAstSelectedState() {
            astStatus.classList.add('hidden');
            astInfoBox.classList.add('hidden');
            btnAnalyzeAst.classList.add('hidden');
            astSelectedIndicator.classList.remove('hidden');
        }

        // Helper: Enable method selection section
        function enableMethodSelection() {
            methodSelectionSection.classList.remove('hidden');
            // Request method extraction
            vscode.postMessage({
                command: 'extractMethods',
                filePath: currentFilePath
            });
        }

        // Helper: Reset AST state
        function resetAstState() {
            cachedAstData = null;
            selectedAstData = null;
            isAstReady = false;
            astStatus.classList.remove('hidden');
            astStatusIcon.innerHTML = '&#9888;';
            astStatusText.textContent = 'Ready to analyze';
            astInfoBox.classList.add('hidden');
            btnAnalyzeAst.classList.remove('hidden');
            astSelectedIndicator.classList.add('hidden');
        }

        // Helper: Reset testability state
        function resetTestabilityState() {
            isTestabilityChecked = false;
            isTestable = false;
            testabilitySection.classList.add('hidden');
            btnCheckTestability.disabled = true;
            btnGenerateScenarios.disabled = true;
        }

        // Check Testability button
        btnCheckTestability.addEventListener('click', () => {
            if (currentFilePath && selectedMethods.length > 0) {
                vscode.postMessage({
                    command: 'checkTestability',
                    filePath: currentFilePath,
                    selectedMethods: selectedMethods
                });
            }
        });

        // Helper: Render refactoring advice
        function renderRefactoringAdvice(advice) {
            if (!advice || advice.length === 0) {
                refactoringSection.classList.add('hidden');
                return;
            }

            refactoringSection.classList.remove('hidden');
            refactoringList.innerHTML = advice.map(item => {
                const severityClass = item.severity === 'error' ? 'error' : (item.severity === 'warning' ? 'warning' : 'info');
                const severityIcon = item.severity === 'error' ? '&#10060;' : (item.severity === 'warning' ? '&#9888;' : '&#8505;');
                return '<div class="refactoring-item ' + severityClass + '">' +
                    '<div class="refactoring-item-header">' +
                    '<span class="refactoring-severity">' + severityIcon + '</span>' +
                    '<span class="refactoring-method">' + escapeHtml(item.method) + '</span>' +
                    '</div>' +
                    '<div class="refactoring-issue">' + escapeHtml(item.issue) + '</div>' +
                    '<div class="refactoring-suggestion">' + escapeHtml(item.suggestion) + '</div>' +
                    '</div>';
            }).join('');
        }

        // Generate scenarios for selected file
        btnGenerateScenarios.addEventListener('click', () => {
            if (currentFilePath && selectedMethods.length > 0) {
                vscode.postMessage({
                    command: 'generateScenarios',
                    filePath: currentFilePath,
                    selectedMethods: selectedMethods
                });
            }
        });

        // Approve scenarios
        btnApproveScenarios.addEventListener('click', () => {
            scenariosApproved = true;
            currentScenarios = scenarioEditor.value;
            scenarioStatus.textContent = 'Approved';
            scenarioStatus.className = 'scenario-status approved';
            scenarioEditor.disabled = true;
            btnApproveScenarios.disabled = true;
            btnGenerateSelected.disabled = false;
            showMessage('success', 'Scenarios approved! You can now generate the test.');
        });

        // Regenerate scenarios with optional feedback
        btnRegenerateScenarios.addEventListener('click', () => {
            if (!currentFilePath) return;

            const feedback = feedbackInput.value.trim();
            vscode.postMessage({
                command: 'regenerateScenarios',
                filePath: currentFilePath,
                selectedMethods: selectedMethods,
                previousScenarios: scenarioEditor.value,
                feedback: feedback || undefined
            });

            feedbackInput.value = '';
            scenariosApproved = false;
            scenarioStatus.textContent = 'Regenerating...';
            scenarioStatus.className = 'scenario-status draft';
        });

        // Scenario editor change - mark as draft if edited after generation
        scenarioEditor.addEventListener('input', () => {
            if (scenariosApproved) {
                scenariosApproved = false;
                scenarioStatus.textContent = 'Draft (Edited)';
                scenarioStatus.className = 'scenario-status draft';
                btnApproveScenarios.disabled = false;
                btnGenerateSelected.disabled = true;
            }
        });

        // Generate test for selected file (with approved scenarios)
        btnGenerateSelected.addEventListener('click', () => {
            if (currentFilePath && scenariosApproved) {
                vscode.postMessage({
                    command: 'generateTestForFile',
                    filePath: currentFilePath,
                    scenarios: scenarioEditor.value,
                    selectedMethods: selectedMethods,
                    autoRunTest: true
                });
            }
        });

        // Stop auto-test
        btnStopAutoTest.addEventListener('click', () => {
            btnStopAutoTest.disabled = true;
            vscode.postMessage({ command: 'stopAutoTest' });
        });

        // Run specific test
        btnRunTest.addEventListener('click', () => {
            const testClassName = testClassNameInput.value.trim();
            if (!testClassName) {
                showMessage('warning', 'Please enter a test class name');
                return;
            }
            vscode.postMessage({
                command: 'runTest',
                testClassName: testClassName
            });
        });

        // Run all tests
        btnRunAllTests.addEventListener('click', () => {
            vscode.postMessage({
                command: 'runAllTests'
            });
        });

        // Run with coverage
        btnRunWithCoverage.addEventListener('click', () => {
            const testClassName = testClassNameInput.value.trim();
            if (!testClassName) {
                showMessage('warning', 'Please enter a test class name');
                return;
            }

            // Get user-defined coverage target
            const userCoverageTarget = parseInt(coverageTargetInput.value) || 80;
            targetCoverage = userCoverageTarget;

            vscode.postMessage({
                command: 'runTestWithCoverage',
                testClassName: testClassName,
                coverageTarget: userCoverageTarget,
                sourceFilePath: currentFilePath,
                testFilePath: currentTestFilePath,
                selectedMethods: selectedMethods,
                autoImprove: true
            });
        });

        // Open coverage report
        btnOpenCoverageReport.addEventListener('click', () => {
            vscode.postMessage({ command: 'openCoverageReport' });
        });

        // Improve coverage
        btnImproveCoverage.addEventListener('click', () => {
            if (currentFilePath && currentCoverage && currentTestFilePath) {
                vscode.postMessage({
                    command: 'improveCoverage',
                    sourceFilePath: currentFilePath,
                    testFilePath: currentTestFilePath,
                    selectedMethods: selectedMethods,
                    currentCoverage: currentCoverage,
                    targetCoverage: targetCoverage
                });
            } else {
                showMessage('warning', 'Please run tests with coverage first.');
            }
        });

        // Apply coverage improvement
        btnApplyImprovement.addEventListener('click', () => {
            if (improvedTestCode && improvedTestFilePath) {
                btnApplyImprovement.disabled = true;
                btnApplyImprovement.textContent = 'Applying...';
                vscode.postMessage({
                    command: 'applyImprovement',
                    testFilePath: improvedTestFilePath,
                    testCode: improvedTestCode
                });
            }
        });

        // Re-run coverage after applying improvement
        btnRerunCoverage.addEventListener('click', () => {
            improvementResultSection.classList.add('hidden');
            const testClassName = testClassNameInput.value.trim();
            if (testClassName) {
                vscode.postMessage({
                    command: 'runTestWithCoverage',
                    testClassName: testClassName
                });
            }
        });

        // Helper: Show improvement result
        function showImprovementResult(additions, expectedIncrease) {
            improvementResultSection.classList.remove('hidden');
            improvementIncrease.textContent = '+' + (expectedIncrease || 0).toFixed(1) + '%';

            // Render additions list
            if (additions && additions.length > 0) {
                improvementAdditions.innerHTML = additions.map(function(addition) {
                    return '<div class="improvement-addition-item">' +
                        '<span class="addition-method">' + escapeHtml(addition.methodName || 'Test method') + '</span>' +
                        '<span class="addition-description">' + escapeHtml(addition.description || '') + '</span>' +
                        '</div>';
                }).join('');
            } else {
                improvementAdditions.innerHTML = '<div class="improvement-addition-item">Additional test cases generated</div>';
            }
        }

        // Helper: Render coverage result
        function renderCoverageResult(coverage, meetsTarget, target) {
            coverageResultSection.classList.remove('hidden');

            // Overall percentage
            coveragePercentage.textContent = coverage.overallCoverage.toFixed(1) + '%';

            // Status
            if (meetsTarget) {
                coverageStatus.textContent = 'Target Met';
                coverageStatus.className = 'coverage-status success';
                coverageHeader.className = 'coverage-header success';
                btnImproveCoverage.classList.add('hidden');
            } else {
                coverageStatus.textContent = 'Below Target (' + target + '%)';
                coverageStatus.className = 'coverage-status failure';
                coverageHeader.className = 'coverage-header failure';
                btnImproveCoverage.classList.remove('hidden');
            }

            // Line coverage bar
            lineCoverageBar.style.width = coverage.lineCoverage + '%';
            lineCoverageBar.className = 'coverage-bar-fill ' + getCoverageClass(coverage.lineCoverage, target);
            lineCoverageValue.textContent = coverage.lineCoverage.toFixed(1) + '%';

            // Branch coverage bar
            branchCoverageBar.style.width = coverage.branchCoverage + '%';
            branchCoverageBar.className = 'coverage-bar-fill ' + getCoverageClass(coverage.branchCoverage, target);
            branchCoverageValue.textContent = coverage.branchCoverage.toFixed(1) + '%';

            // Method coverage
            if (coverage.methodCoverage && Object.keys(coverage.methodCoverage).length > 0) {
                methodCoverageSection.classList.remove('hidden');
                renderMethodCoverage(coverage.methodCoverage, target);
            } else {
                methodCoverageSection.classList.add('hidden');
            }
        }

        // Helper: Get coverage class based on percentage
        function getCoverageClass(percentage, target) {
            if (percentage >= target) return 'high';
            if (percentage >= target * 0.7) return 'medium';
            return 'low';
        }

        // Helper: Render method coverage list
        function renderMethodCoverage(methodCoverage, target) {
            const methods = Object.entries(methodCoverage);
            methodCoverageList.innerHTML = methods.map(function(entry) {
                const methodName = entry[0];
                const data = entry[1];
                const avgCoverage = (data.lineCoverage + data.branchCoverage) / 2;
                const coverageClass = getCoverageClass(avgCoverage, target);
                return '<div class="method-coverage-item ' + coverageClass + '">' +
                    '<span class="method-name">' + escapeHtml(methodName) + '</span>' +
                    '<span class="method-coverage-value">' + avgCoverage.toFixed(0) + '%</span>' +
                    '</div>';
            }).join('');
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'settingsLoaded':
                    apiUrlInput.value = message.apiUrl || '';
                    apiKeyInput.value = message.apiKey || '';
                    testFrameworkSelect.value = message.testFramework || 'junit5';
                    mockingFrameworkSelect.value = message.mockingFramework || 'mockito';

                    // Update connection status based on configuration
                    const isConfigured = message.isConfigured;
                    if (!isConfigured) {
                        updateConnectionStatus('unknown', 'Not configured');
                    }
                    break;

                case 'settingsSaved':
                    if (message.success) {
                        showMessage('success', 'Settings saved!');
                    }
                    break;

                case 'connectionTesting':
                    testConnectionText.textContent = 'Testing...';
                    testConnectionSpinner.classList.remove('hidden');
                    btnTestConnection.disabled = true;
                    break;

                case 'connectionResult':
                    testConnectionText.textContent = 'Test Connection';
                    testConnectionSpinner.classList.add('hidden');
                    btnTestConnection.disabled = false;

                    if (message.success) {
                        updateConnectionStatus('connected', 'Connected (v' + message.version + ')');
                        if (message.features && message.features.length > 0) {
                            showMessage('success', 'Features: ' + message.features.join(', '));
                        }
                    } else {
                        updateConnectionStatus('disconnected', message.error || 'Connection failed');
                    }
                    break;

                case 'fileSelected':
                    currentFilePath = message.filePath;
                    currentTestClassName = message.fileName.replace('.java', 'Test');
                    selectedFileName.textContent = message.fileName;
                    selectedFilePath.textContent = message.filePath;
                    selectedFilePath.title = message.filePath;

                    fileSelectionOptions.classList.add('hidden');
                    selectedFile.classList.remove('hidden');

                    // Reset state
                    scenariosApproved = false;
                    currentScenarios = '';
                    availableMethods = [];
                    selectedMethods = [];
                    scenarioSection.classList.add('hidden');
                    scenarioEditor.value = '';
                    scenarioEditor.disabled = false;
                    scenarioStatus.textContent = 'Draft';
                    scenarioStatus.className = 'scenario-status draft';
                    btnApproveScenarios.disabled = false;

                    // Reset AST state and show AST section
                    resetAstState();
                    astSection.classList.remove('hidden');
                    methodSelectionSection.classList.add('hidden');
                    btnGenerateScenarios.disabled = true;
                    btnGenerateSelected.disabled = true;

                    // Request AST cache check (instead of directly extracting methods)
                    vscode.postMessage({
                        command: 'checkAstCache',
                        filePath: message.filePath
                    });

                    // Auto-fill test class name
                    testClassNameInput.value = currentTestClassName;
                    break;

                case 'methodsLoaded':
                    availableMethods = message.methods || [];
                    renderMethods(availableMethods);
                    if (availableMethods.length > 0) {
                        showMessage('success', availableMethods.length + ' methods found. Select methods and generate scenarios.');
                    } else {
                        showMessage('warning', 'No public methods found in this file.');
                    }
                    break;

                case 'astCacheChecked':
                    // No caching - always show Analyze button
                    cachedAstData = message.astData;
                    astStatusIcon.innerHTML = '&#128269;';
                    astStatusText.textContent = 'Click to analyze';
                    astStatus.classList.remove('hidden');
                    astInfoBox.classList.add('hidden');
                    btnAnalyzeAst.classList.remove('hidden');
                    break;

                case 'astAnalyzing':
                    analyzeAstText.textContent = 'Analyzing...';
                    analyzeAstSpinner.classList.remove('hidden');
                    btnAnalyzeAst.disabled = true;
                    break;

                case 'astAnalyzed':
                    analyzeAstText.textContent = 'Analyze AST';
                    analyzeAstSpinner.classList.add('hidden');
                    btnAnalyzeAst.disabled = false;

                    cachedAstData = message.astData;
                    selectedAstData = message.astData;
                    isAstReady = true;

                    // Show AST info and selected state
                    showAstInfo(message.astData);
                    showAstSelectedState();
                    enableMethodSelection();

                    showMessage('success', 'AST analysis completed.');
                    break;

                case 'astAnalyzeError':
                    analyzeAstText.textContent = 'Analyze AST';
                    analyzeAstSpinner.classList.add('hidden');
                    btnAnalyzeAst.disabled = false;
                    // Error is shown as VS Code notification
                    break;

                case 'astSelected':
                    selectedAstData = message.astData;
                    isAstReady = true;
                    showAstSelectedState();
                    enableMethodSelection();
                    break;

                case 'testabilityChecking':
                    checkTestabilityText.textContent = 'Checking...';
                    testabilitySpinner.classList.remove('hidden');
                    btnCheckTestability.disabled = true;
                    break;

                case 'testabilityResult':
                    checkTestabilityText.textContent = 'Check Testability';
                    testabilitySpinner.classList.add('hidden');
                    btnCheckTestability.disabled = false;

                    isTestabilityChecked = true;
                    isTestable = message.testable;

                    testabilitySection.classList.remove('hidden');

                    if (message.testable) {
                        testabilityHeader.className = 'testability-header success';
                        testabilityIcon.innerHTML = '&#10004;';
                        testabilityText.textContent = 'Code is testable';
                        refactoringSection.classList.add('hidden');
                        btnGenerateScenarios.disabled = false;
                        showMessage('success', 'Code is testable! Proceed to generate scenarios.');
                    } else {
                        testabilityHeader.className = 'testability-header failure';
                        testabilityIcon.innerHTML = '&#10060;';
                        testabilityText.textContent = 'Testability issues found';
                        renderRefactoringAdvice(message.refactoringAdvice);
                        btnGenerateScenarios.disabled = true;
                        showMessage('warning', 'Please review the refactoring suggestions.');
                    }
                    break;

                case 'testabilityError':
                    checkTestabilityText.textContent = 'Check Testability';
                    testabilitySpinner.classList.add('hidden');
                    btnCheckTestability.disabled = false;
                    // Error is shown as VS Code notification
                    break;

                case 'scenarioGenerating':
                    generateScenariosText.textContent = 'Generating...';
                    scenarioSpinner.classList.remove('hidden');
                    btnGenerateScenarios.disabled = true;
                    btnRegenerateScenarios.disabled = true;
                    break;

                case 'scenarioGenerated':
                    generateScenariosText.textContent = 'Generate Scenarios';
                    scenarioSpinner.classList.add('hidden');
                    btnGenerateScenarios.disabled = false;
                    btnRegenerateScenarios.disabled = false;

                    scenarioSection.classList.remove('hidden');
                    scenarioEditor.value = message.scenarios;
                    scenarioEditor.disabled = false;
                    scenarioStatus.textContent = 'Draft';
                    scenarioStatus.className = 'scenario-status draft';
                    btnApproveScenarios.disabled = false;
                    btnGenerateSelected.disabled = true;
                    scenariosApproved = false;

                    showMessage('success', 'Scenarios generated! Review and approve to continue.');
                    break;

                case 'scenarioError':
                    generateScenariosText.textContent = 'Generate Scenarios';
                    scenarioSpinner.classList.add('hidden');
                    btnGenerateScenarios.disabled = false;
                    btnRegenerateScenarios.disabled = false;
                    // Error is shown as VS Code notification, just reset button state
                    break;

                case 'testRunning':
                    runTestText.textContent = 'Running...';
                    runTestSpinner.classList.remove('hidden');
                    btnRunTest.disabled = true;
                    btnRunAllTests.disabled = true;
                    testResultArea.classList.add('hidden');
                    break;

                case 'testResult':
                    runTestText.textContent = 'Run Test';
                    runTestSpinner.classList.add('hidden');
                    btnRunTest.disabled = false;
                    btnRunAllTests.disabled = false;

                    testResultArea.classList.remove('hidden');
                    const isSuccess = message.success;
                    testResult.className = 'test-result ' + (isSuccess ? 'success' : 'failure');
                    testResult.innerHTML =
                        '<div class="test-result-header ' + (isSuccess ? 'success' : 'failure') + '">' +
                        (isSuccess ? '&#10004; ' : '&#10008; ') +
                        (isSuccess ? 'Tests Passed' : 'Tests Failed') +
                        '</div>' +
                        '<div class="test-result-details">' + escapeHtml(message.details || '') + '</div>';

                    if (isSuccess) {
                        showMessage('success', 'All tests passed!');
                    }
                    break;

                case 'testError':
                    btnStopAutoTest.classList.add('hidden');
                    btnGenerateSelected.disabled = false;
                    runTestText.textContent = 'Run Test';
                    runTestSpinner.classList.add('hidden');
                    btnRunTest.disabled = false;
                    btnRunAllTests.disabled = false;
                    break;

                case 'coverageRunning':
                    runWithCoverageText.textContent = 'Running...';
                    coverageSpinner.classList.remove('hidden');
                    btnRunWithCoverage.disabled = true;
                    break;

                case 'coverageResult':
                    runWithCoverageText.textContent = 'Run with Coverage';
                    coverageSpinner.classList.add('hidden');
                    btnRunWithCoverage.disabled = false;

                    currentCoverage = message.coverage;
                    targetCoverage = message.targetCoverage;
                    renderCoverageResult(message.coverage, message.meetsTarget, message.targetCoverage);

                    if (message.meetsTarget) {
                        showMessage('success', 'Coverage target met! ' + message.coverage.overallCoverage.toFixed(1) + '%');
                    } else {
                        showMessage('warning', 'Coverage below target. Click "Improve Coverage" to enhance.');
                    }
                    break;

                case 'coverageError':
                    runWithCoverageText.textContent = 'Run with Coverage';
                    coverageSpinner.classList.add('hidden');
                    btnRunWithCoverage.disabled = false;
                    // Error is shown as VS Code notification
                    break;

                case 'jacocoConfigResult':
                    if (!message.configured) {
                        showMessage('warning', 'Jacoco not configured. Add Jacoco plugin to your build file.');
                    }
                    break;

                case 'improveCoverageStarted':
                    btnImproveCoverage.disabled = true;
                    btnImproveCoverage.textContent = 'Improving...';
                    break;

                case 'improveCoverageResult':
                    btnImproveCoverage.disabled = false;
                    btnImproveCoverage.textContent = 'Improve Coverage';

                    // Store the improved test code for applying
                    improvedTestCode = message.improvedTestCode;
                    improvedTestFilePath = message.testFilePath;

                    // Show the improvement result section
                    showImprovementResult(message.additions, message.expectedCoverageIncrease);
                    break;

                case 'improveCoverageError':
                    btnImproveCoverage.disabled = false;
                    btnImproveCoverage.textContent = 'Improve Coverage';
                    showMessage('error', message.error);
                    break;

                case 'applyImprovementSuccess':
                    btnApplyImprovement.disabled = false;
                    btnApplyImprovement.textContent = 'Apply Changes';
                    showMessage('success', 'Changes applied! Click "Re-run Coverage" to verify.');
                    break;

                case 'applyImprovementError':
                    btnApplyImprovement.disabled = false;
                    btnApplyImprovement.textContent = 'Apply Changes';
                    showMessage('error', message.error);
                    break;

                case 'testFileSaved':
                    // Update current test file path when test is generated
                    currentTestFilePath = message.testFilePath;
                    break;

                // Auto-Test handlers
                case 'autoTestStarting':
                    btnGenerateSelected.disabled = true;
                    btnStopAutoTest.classList.remove('hidden');
                    btnStopAutoTest.disabled = false;
                    showMessage('info', 'Test generated! Auto-running tests...');
                    break;

                case 'testSuccess':
                    btnStopAutoTest.classList.add('hidden');
                    btnGenerateSelected.disabled = false;
                    testResultArea.classList.remove('hidden');
                    testResult.className = 'test-result success';
                    testResult.innerHTML = '<div class="result-header">&#10004; All Tests Passed!</div>' +
                        '<pre class="result-details">' + escapeHtml(message.details) + '</pre>';
                    showMessage('success', 'All tests passed!');
                    break;

                case 'testFailed':
                    testResultArea.classList.remove('hidden');
                    testResult.className = 'test-result failure';
                    testResult.innerHTML = '<div class="result-header">&#10060; Tests Failed - Auto-Regenerating (Attempt ' + (message.retryCount + 1) + '/3)...</div>' +
                        '<div class="result-error">' + escapeHtml(message.error) + '</div>' +
                        '<pre class="result-details">' + escapeHtml(message.details) + '</pre>';
                    showMessage('warning', 'Tests failed. Auto-regenerating...');
                    break;

                case 'testRegenerating':
                    showMessage('info', 'Regenerating test code (Attempt ' + message.retryCount + '/' + message.maxRetries + ')...');
                    break;

                case 'testRegenerated':
                    showMessage('success', 'Test code regenerated. Running tests again...');
                    break;

                case 'testRegenerationFailed':
                    btnStopAutoTest.classList.add('hidden');
                    btnGenerateSelected.disabled = false;
                    testResultArea.classList.remove('hidden');
                    testResult.className = 'test-result failure';
                    testResult.innerHTML = '<div class="result-header">&#10060; Max Retries Reached</div>' +
                        '<div class="result-error">' + escapeHtml(message.error) + '</div>' +
                        '<pre class="result-details">' + escapeHtml(message.testOutput || '') + '</pre>';
                    showMessage('error', 'Test generation failed after 3 attempts. Please review manually.');
                    break;

                case 'testRegenerationError':
                    btnStopAutoTest.classList.add('hidden');
                    btnGenerateSelected.disabled = false;
                    showMessage('error', 'Test regeneration failed: ' + message.error);
                    break;

                case 'autoTestStopped':
                    btnStopAutoTest.classList.add('hidden');
                    btnGenerateSelected.disabled = false;
                    runTestText.textContent = 'Run Test';
                    runTestSpinner.classList.add('hidden');
                    btnRunTest.disabled = false;
                    btnRunAllTests.disabled = false;
                    showMessage('info', 'Auto-test stopped.');
                    break;

                // Auto Coverage Improvement handlers
                case 'improvingCoverage':
                    showMessage('info', 'Auto-improving coverage (Iteration ' + message.iteration + '/5)...');
                    break;
            }
        });

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        function updateConnectionStatus(status, text) {
            connectionDot.className = 'dot ' + status;
            connectionText.textContent = text;
        }

        function showMessage(type, text) {
            messageArea.className = 'status ' + type;
            messageArea.textContent = text;
            messageArea.classList.remove('hidden');

            setTimeout(() => {
                messageArea.classList.add('hidden');
            }, 5000);
        }
    `;
}
