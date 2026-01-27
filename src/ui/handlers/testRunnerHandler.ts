import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { HandlerContext } from './types';
import { PathResolver } from '../../services/pathResolver';

/**
 * Callback for running test with coverage after test passes
 */
export type CoverageCallback = (testClassName: string) => Promise<void>;

/**
 * Handles test execution and regeneration operations
 */
export class TestRunnerHandler {
    private _coverageCallback: CoverageCallback | null = null;
    private _cancelled: boolean = false;
    private _currentProcess: ChildProcess | null = null;

    /**
     * Sets the callback for running coverage after tests pass
     */
    setCoverageCallback(callback: CoverageCallback): void {
        this._coverageCallback = callback;
    }

    /**
     * Stops the auto-test cycle by cancelling the current process and flag
     */
    stopAutoTest(context: HandlerContext): void {
        this._cancelled = true;
        if (this._currentProcess) {
            this._currentProcess.kill('SIGTERM');
            this._currentProcess = null;
        }
        context.postMessage({ command: 'autoTestStopped' });
    }

    /**
     * Generates test for a file with optional scenarios
     */
    async generateTestForFile(
        filePath: string,
        scenarios: string | undefined,
        selectedMethods: string[] | undefined,
        autoRunTest: boolean,
        context: HandlerContext
    ): Promise<void> {
        if (!filePath) {
            vscode.window.showWarningMessage('No file selected');
            return;
        }

        this._cancelled = false;

        try {
            const uri = vscode.Uri.file(filePath);

            // Generate test using command
            await vscode.commands.executeCommand('javaTestGenerator.generateTest', uri, scenarios);

            if (this._cancelled) { return; }

            // If autoRunTest is true, wait a bit for file to be saved, then auto-run test
            if (autoRunTest) {
                // Wait 1 second for file to be fully saved
                await new Promise(resolve => setTimeout(resolve, 1000));

                if (this._cancelled) { return; }

                // Extract test class name
                const fileName = filePath.split(/[/\\]/).pop() || '';
                const className = fileName.replace('.java', '');
                const testClassName = `${className}Test`;

                // Notify UI that we're starting auto-test
                context.postMessage({
                    command: 'autoTestStarting',
                    testClassName
                });

                // Get the generated test file path
                const pathResolver = new PathResolver();
                const sourceUri = vscode.Uri.file(filePath);
                const testUri = pathResolver.resolveTestPath(sourceUri);

                // Auto-run test with self-healing
                await this.runTestAndHandleErrors(
                    testUri.fsPath,
                    filePath,
                    scenarios || '',
                    selectedMethods || [],
                    0,
                    context
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Test generation failed: ${message}`);
        }
    }

    /**
     * Runs a specific test class
     */
    async runTest(testClassName: string, context: HandlerContext): Promise<void> {
        context.postMessage({ command: 'testRunning' });

        try {
            // Validate test class name to prevent command injection
            if (!this.validateTestClassName(testClassName)) {
                throw new Error('Invalid test class name. Only valid Java class names are allowed.');
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const buildTool = await this.detectBuildTool(workspaceFolder.uri);
            let command: string;
            let args: string[];

            if (buildTool === 'gradle') {
                if (process.platform === 'win32') {
                    command = 'gradlew.bat';
                } else {
                    command = './gradlew';
                }
                args = ['test', '--tests', testClassName, '--info'];
            } else if (buildTool === 'maven') {
                command = 'mvn';
                args = ['test', `-Dtest=${testClassName}`];
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this.executeCommand(command, args, workspaceFolder.uri.fsPath);

            const success = this.parseTestResult(result, buildTool);

            context.postMessage({
                command: 'testResult',
                success: success,
                details: this.formatTestOutput(result)
            });

            if (success) {
                vscode.window.showInformationMessage('All tests passed!');
            } else {
                vscode.window.showWarningMessage('Some tests failed. Check the results below.');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'testError',
                error: message
            });
            vscode.window.showErrorMessage(`Test execution failed: ${message}`);
        }
    }

    /**
     * Runs all tests in the project
     */
    async runAllTests(context: HandlerContext): Promise<void> {
        context.postMessage({ command: 'testRunning' });

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            const buildTool = await this.detectBuildTool(workspaceFolder.uri);
            let command: string;
            let args: string[];

            if (buildTool === 'gradle') {
                if (process.platform === 'win32') {
                    command = 'gradlew.bat';
                } else {
                    command = './gradlew';
                }
                args = ['test', '--info'];
            } else if (buildTool === 'maven') {
                command = 'mvn';
                args = ['test'];
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this.executeCommand(command, args, workspaceFolder.uri.fsPath);

            const success = this.parseTestResult(result, buildTool);

            context.postMessage({
                command: 'testResult',
                success: success,
                details: this.formatTestOutput(result)
            });

            if (success) {
                vscode.window.showInformationMessage('All tests passed!');
            } else {
                vscode.window.showWarningMessage('Some tests failed. Check the results below.');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'testError',
                error: message
            });
            vscode.window.showErrorMessage(`Test execution failed: ${message}`);
        }
    }

    /**
     * Runs test and handles errors with auto-regeneration
     */
    async runTestAndHandleErrors(
        testFilePath: string,
        sourceFilePath: string,
        scenarios: string,
        selectedMethods: string[],
        retryCount: number,
        context: HandlerContext
    ): Promise<void> {
        if (this._cancelled) { return; }

        context.postMessage({ command: 'testRunning' });

        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                throw new Error('No workspace folder found');
            }

            // Extract test class name from file path
            const testClassName = testFilePath.split(/[/\\]/).pop()?.replace('.java', '') || '';

            if (!this.validateTestClassName(testClassName)) {
                throw new Error('Invalid test class name');
            }

            const buildTool = await this.detectBuildTool(workspaceFolder.uri);
            let command: string;
            let args: string[];

            if (buildTool === 'gradle') {
                command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
                args = ['test', '--tests', testClassName, '--info'];
            } else if (buildTool === 'maven') {
                command = 'mvn';
                args = ['test', `-Dtest=${testClassName}`];
            } else {
                throw new Error('No Maven or Gradle build file found');
            }

            const result = await this.executeCommand(command, args, workspaceFolder.uri.fsPath);

            if (this._cancelled) { return; }

            const success = this.parseTestResult(result, buildTool);

            if (success) {
                context.postMessage({
                    command: 'testSuccess',
                    details: this.formatTestOutput(result)
                });
                vscode.window.showInformationMessage('All tests passed! Proceeding to coverage analysis...');

                // Auto-proceed to coverage analysis
                if (this._coverageCallback) {
                    await this._coverageCallback(testClassName);
                }
            } else {
                // Test failed - extract error and regenerate
                const errorMessage = this.extractTestError(result);

                context.postMessage({
                    command: 'testFailed',
                    error: errorMessage,
                    details: this.formatTestOutput(result),
                    retryCount
                });

                vscode.window.showWarningMessage(
                    `Tests failed (Attempt ${retryCount + 1}). Auto-regenerating...`
                );

                // Auto-regenerate with error context
                await this.regenerateTestWithError(
                    sourceFilePath,
                    testFilePath,
                    errorMessage,
                    result,
                    scenarios,
                    selectedMethods,
                    retryCount,
                    context
                );
            }
        } catch (error) {
            if (this._cancelled) { return; }
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'testError',
                error: message
            });
            vscode.window.showErrorMessage(`Test execution failed: ${message}`);
        }
    }

    /**
     * Regenerates test code after test execution failure with error context
     */
    async regenerateTestWithError(
        sourceFilePath: string,
        testFilePath: string,
        errorMessage: string,
        testOutput: string,
        scenarios: string,
        selectedMethods: string[],
        retryCount: number,
        context: HandlerContext
    ): Promise<void> {
        if (this._cancelled) { return; }

        const maxRetries = 3;

        if (retryCount >= maxRetries) {
            context.postMessage({
                command: 'testRegenerationFailed',
                error: `Max retries (${maxRetries}) reached. Please review the test manually.`,
                testOutput
            });
            vscode.window.showErrorMessage(`Test generation failed after ${maxRetries} attempts. Please review manually.`);
            return;
        }

        context.postMessage({
            command: 'testRegenerating',
            retryCount: retryCount + 1,
            maxRetries
        });

        try {
            const uri = vscode.Uri.file(sourceFilePath);
            const contentBuffer = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(contentBuffer);
            const fileName = sourceFilePath.split(/[/\\]/).pop() || '';

            // Extract package name
            const packageMatch = content.match(/^\s*package\s+([\w.]+)\s*;/m);
            const packageName = packageMatch ? packageMatch[1] : '';

            // Regenerate test with error context (included in scenarios as feedback)
            const errorFeedback = `\n\n# Previous Test Execution Error (Attempt ${retryCount + 1}):\n${errorMessage}\n\nTest Output:\n${testOutput}\n\nPlease fix the test code to resolve this error.`;

            const response = await context.apiClient.generateTest({
                sourceFile: {
                    fileName,
                    packageName,
                    content
                },
                options: {
                    testFramework: context.settings.getTestFramework(),
                    mockingFramework: context.settings.getMockingFramework(),
                    coverageTarget: context.settings.getCoverageTarget(),
                    includeEdgeCases: context.settings.includeEdgeCases()
                },
                scenarios: scenarios + errorFeedback,
                selectedMethods: selectedMethods
            });

            if (this._cancelled) { return; }

            if (response.success) {
                // Apply the new test code
                const pathResolver = new PathResolver();
                const sourceUri = vscode.Uri.file(sourceFilePath);
                const testUri = testFilePath
                    ? vscode.Uri.file(testFilePath)
                    : pathResolver.resolveTestPath(sourceUri, response.testFile.suggestedPath);

                const encoder = new TextEncoder();
                await vscode.workspace.fs.writeFile(testUri, encoder.encode(response.testFile.content));

                context.postMessage({
                    command: 'testRegenerated',
                    testFilePath: testUri.fsPath,
                    retryCount: retryCount + 1
                });

                // Auto-run the test again
                await this.runTestAndHandleErrors(
                    testUri.fsPath,
                    sourceFilePath,
                    scenarios,
                    selectedMethods,
                    retryCount + 1,
                    context
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            context.postMessage({
                command: 'testRegenerationError',
                error: message
            });
            vscode.window.showErrorMessage(`Test regeneration failed: ${message}`);
        }
    }

    /**
     * Detects the build tool used in the workspace
     */
    async detectBuildTool(workspaceUri: vscode.Uri): Promise<'maven' | 'gradle' | null> {
        const gradleFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceUri, '{build.gradle,build.gradle.kts}'),
            null,
            1
        );
        if (gradleFiles.length > 0) {
            return 'gradle';
        }

        const mavenFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceUri, 'pom.xml'),
            null,
            1
        );
        if (mavenFiles.length > 0) {
            return 'maven';
        }

        return null;
    }

    /**
     * Executes a command safely using spawn (no shell) to prevent command injection
     */
    executeCommand(command: string, args: string[], cwd: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Use spawn with shell: false (default) to prevent command injection
            const child = spawn(command, args, {
                cwd,
                shell: false,  // Explicitly disable shell to prevent injection
                env: { ...process.env },  // Inherit environment but don't expose sensitive vars
                windowsHide: true
            });

            this._currentProcess = child;

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data: Buffer) => {
                stderr += data.toString();
            });

            child.on('error', (error: Error) => {
                reject(error);
            });

            child.on('close', (code: number) => {
                this._currentProcess = null;
                const output = stdout + '\n' + stderr;
                // Even with non-zero exit code, we might have useful test output
                if (code !== 0 && !stdout && !stderr) {
                    reject(new Error(`Command exited with code ${code}`));
                } else {
                    resolve(output);
                }
            });

            // Set timeout to prevent hanging processes (5 minutes)
            setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error('Command timed out after 5 minutes'));
            }, 5 * 60 * 1000);
        });
    }

    /**
     * Parses test result output to determine success
     */
    parseTestResult(output: string, buildTool: 'maven' | 'gradle' | null): boolean {
        const lowerOutput = output.toLowerCase();

        if (buildTool === 'gradle') {
            // Gradle success indicators
            if (lowerOutput.includes('build successful') ||
                (lowerOutput.includes('test') && !lowerOutput.includes('failed') && !lowerOutput.includes('failure'))) {
                return true;
            }
            return !lowerOutput.includes('build failed') &&
                   !lowerOutput.includes('test failed') &&
                   !lowerOutput.includes('failures:');
        } else if (buildTool === 'maven') {
            // Maven success indicators
            if (lowerOutput.includes('build success')) {
                return true;
            }
            return !lowerOutput.includes('build failure') &&
                   !lowerOutput.includes('tests run:') &&
                   !lowerOutput.includes('failures:');
        }

        return !lowerOutput.includes('fail') && !lowerOutput.includes('error');
    }

    /**
     * Formats test output for display
     */
    formatTestOutput(output: string): string {
        // Extract relevant lines from test output
        const lines = output.split('\n');
        const relevantLines: string[] = [];

        for (const line of lines) {
            const lowerLine = line.toLowerCase();
            // Include test-related lines
            if (lowerLine.includes('test') ||
                lowerLine.includes('passed') ||
                lowerLine.includes('failed') ||
                lowerLine.includes('success') ||
                lowerLine.includes('failure') ||
                lowerLine.includes('error') ||
                lowerLine.includes('build') ||
                lowerLine.includes('running') ||
                line.trim().startsWith('>')) {
                relevantLines.push(line);
            }
        }

        // Limit output length
        const maxLines = 30;
        if (relevantLines.length > maxLines) {
            return relevantLines.slice(0, maxLines).join('\n') + '\n... (truncated)';
        }

        return relevantLines.join('\n') || output.substring(0, 1000);
    }

    /**
     * Extracts meaningful error message from test output
     */
    extractTestError(output: string): string {
        const lines = output.split('\n');
        const errorLines: string[] = [];
        let inError = false;

        for (const line of lines) {
            const lowerLine = line.toLowerCase();

            // Start capturing at error indicators
            if (lowerLine.includes('failed') ||
                lowerLine.includes('error') ||
                lowerLine.includes('exception') ||
                lowerLine.includes('assertion')) {
                inError = true;
            }

            if (inError) {
                errorLines.push(line);
                // Stop after reasonable context
                if (errorLines.length > 20) {
                    break;
                }
            }
        }

        return errorLines.length > 0
            ? errorLines.join('\n')
            : 'Test failed with unknown error. Check full output.';
    }

    /**
     * Validates test class name to prevent command injection
     * Only allows valid Java class name characters
     */
    validateTestClassName(name: string): boolean {
        // Java class names: start with letter or underscore, followed by letters, digits, underscores, or $
        // Also allow dots for fully qualified names and * for wildcards
        const validPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*\*?$/;
        return validPattern.test(name) && name.length <= 256;
    }
}
