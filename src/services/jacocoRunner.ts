import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { JacocoCoverageResult } from '../api/types';

/**
 * Build tool type
 */
type BuildTool = 'maven' | 'gradle';

/**
 * Jacoco execution result
 */
export interface JacocoExecutionResult {
    success: boolean;
    coverage?: JacocoCoverageResult;
    error?: string;
    reportPath?: string;
}

/**
 * Service for running Jacoco and parsing coverage reports
 */
export class JacocoRunner {
    private workspaceFolder: vscode.WorkspaceFolder;

    constructor(workspaceFolder: vscode.WorkspaceFolder) {
        this.workspaceFolder = workspaceFolder;
    }

    /**
     * Detects the build tool used in the project
     */
    async detectBuildTool(): Promise<BuildTool | null> {
        const workspaceUri = this.workspaceFolder.uri;

        // Check for Gradle
        const gradleFiles = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceUri, '{build.gradle,build.gradle.kts}'),
            null,
            1
        );
        if (gradleFiles.length > 0) {
            return 'gradle';
        }

        // Check for Maven
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
     * Runs tests with Jacoco coverage
     */
    async runTestsWithCoverage(testClassName?: string): Promise<JacocoExecutionResult> {
        const buildTool = await this.detectBuildTool();

        if (!buildTool) {
            return {
                success: false,
                error: 'No Maven or Gradle build file found'
            };
        }

        try {
            // Run tests with coverage
            await this.executeTestsWithCoverage(buildTool, testClassName);

            // Parse coverage report
            const coverage = await this.parseCoverageReport(buildTool);

            if (coverage) {
                return {
                    success: true,
                    coverage,
                    reportPath: this.getReportPath(buildTool)
                };
            } else {
                return {
                    success: false,
                    error: 'Failed to parse coverage report. Make sure Jacoco is configured.'
                };
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return {
                success: false,
                error: message
            };
        }
    }

    /**
     * Executes tests with Jacoco coverage
     * Uses command-line plugin invocation for maximum compatibility (no build file modification needed!)
     */
    private async executeTestsWithCoverage(buildTool: BuildTool, testClassName?: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            let command: string;
            let args: string[];

            if (buildTool === 'gradle') {
                // Gradle: Apply jacoco plugin via init script (no build.gradle modification needed!)
                // Based on: https://stackoverflow.com/questions/54763222/
                command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
                
                // Create temporary init script for Jacoco
                // Java plugin is required for Jacoco to work
                const initScriptContent = `
allprojects {
    apply plugin: 'java'
    apply plugin: org.gradle.testing.jacoco.plugins.JacocoPlugin
    
    jacoco {
        toolVersion = '0.8.14'
    }
    
    // Ensure jacocoTestReport task exists and depends on test
    tasks.withType(Test) {
        finalizedBy jacocoTestReport
    }
    
    jacocoTestReport {
        dependsOn test
        reports {
            xml.required = true
            html.required = true
        }
    }
}
`;
                
                // Write temporary init script
                const initScriptPath = path.join(this.workspaceFolder.uri.fsPath, 'jacoco-temp-init.gradle');
                try {
                    const fs = await import('fs');
                    await fs.promises.writeFile(initScriptPath, initScriptContent, 'utf8');
                    console.log('[JacocoRunner] Created temporary init script:', initScriptPath);
                } catch (error) {
                    console.error('[JacocoRunner] Failed to create init script:', error);
                    reject(new Error('Failed to create Jacoco init script'));
                    return;
                }
                
                args = ['--init-script', initScriptPath, 'test', 'jacocoTestReport'];
                if (testClassName) {
                    args.push('--tests', testClassName);
                }
                
                console.log('[JacocoRunner] Using init-script Jacoco invocation (no build.gradle modification needed)');
                console.log('[JacocoRunner] Command:', command, args.join(' '));
            } else {
                // Maven: Use direct plugin invocation (no pom.xml modification needed!)
                // Based on: https://stackoverflow.com/questions/72277994/
                command = 'mvn';
                args = [
                    'clean',
                    'org.jacoco:jacoco-maven-plugin:0.8.14:prepare-agent',
                    'test',
                    'org.jacoco:jacoco-maven-plugin:0.8.14:report'
                ];
                if (testClassName) {
                    args.push(`-Dtest=${testClassName}`);
                }
                
                console.log('[JacocoRunner] Using command-line Jacoco invocation (no pom.xml modification needed)');
                console.log('[JacocoRunner] Command:', command, args.join(' '));
            }

            const child = spawn(command, args, {
                cwd: this.workspaceFolder.uri.fsPath,
                shell: true,  // Windows에서 mvn, gradlew 실행을 위해 필요
                env: { ...process.env },
                windowsHide: true
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data: Buffer) => {
                const output = data.toString();
                stdout += output;
                console.log('[JacocoRunner] STDOUT:', output);
            });

            child.stderr.on('data', (data: Buffer) => {
                const output = data.toString();
                stderr += output;
                console.log('[JacocoRunner] STDERR:', output);
            });

            child.on('error', (error: Error) => {
                reject(error);
            });

            child.on('close', async (code: number) => {
                console.log('[JacocoRunner] Command exit code:', code);
                console.log('[JacocoRunner] Full stdout length:', stdout.length);
                console.log('[JacocoRunner] Full stderr length:', stderr.length);
                
                // Cleanup temporary init script for Gradle
                if (buildTool === 'gradle') {
                    const initScriptPath = path.join(this.workspaceFolder.uri.fsPath, 'jacoco-temp-init.gradle');
                    try {
                        const fs = await import('fs');
                        await fs.promises.unlink(initScriptPath);
                        console.log('[JacocoRunner] Cleaned up temporary init script');
                    } catch (error) {
                        // Ignore cleanup errors
                        console.log('[JacocoRunner] Note: Could not cleanup init script (may not exist)');
                    }
                }
                
                if (code === 0) {
                    console.log('[JacocoRunner] ✅ Command succeeded');
                    resolve();
                } else {
                    console.log('[JacocoRunner] ⚠️ Command exited with non-zero code');
                    // Check if tests ran but some failed (still produces coverage)
                    if (stdout.includes('BUILD SUCCESSFUL') || stderr.includes('BUILD SUCCESSFUL')) {
                        console.log('[JacocoRunner] Build successful despite non-zero exit');
                        resolve(); // Coverage report might still be generated
                    } else if (stdout.includes('BUILD FAILED') || stderr.includes('BUILD FAILED')) {
                        console.log('[JacocoRunner] ❌ Build failed');
                        reject(new Error(`Build failed with code ${code}:\n${stderr || stdout}`));
                    } else {
                        // Try to resolve anyway - coverage might have been generated
                        console.log('[JacocoRunner] Attempting to continue despite exit code');
                        resolve();
                    }
                }
            });

            // Timeout after 10 minutes
            setTimeout(() => {
                child.kill('SIGTERM');
                reject(new Error('Test execution timed out after 10 minutes'));
            }, 10 * 60 * 1000);
        });
    }

    /**
     * Gets the path to the Jacoco report
     */
    private getReportPath(buildTool: BuildTool): string {
        const basePath = this.workspaceFolder.uri.fsPath;

        if (buildTool === 'gradle') {
            return path.join(basePath, 'build', 'reports', 'jacoco', 'test', 'jacocoTestReport.xml');
        } else {
            return path.join(basePath, 'target', 'site', 'jacoco', 'jacoco.xml');
        }
    }

    /**
     * Parses the Jacoco XML coverage report
     */
    async parseCoverageReport(buildTool: BuildTool): Promise<JacocoCoverageResult | null> {
        const reportPath = this.getReportPath(buildTool);

        try {
            const reportUri = vscode.Uri.file(reportPath);
            const contentBuffer = await vscode.workspace.fs.readFile(reportUri);
            const content = new TextDecoder().decode(contentBuffer);

            return this.parseJacocoXml(content);
        } catch (error) {
            console.error('Failed to read Jacoco report:', error);
            return null;
        }
    }

    /**
     * Parses Jacoco XML content
     */
    private parseJacocoXml(xmlContent: string): JacocoCoverageResult | null {
        try {
            // Extract package and class info
            const packageMatch = xmlContent.match(/<package\s+name="([^"]+)"/);
            const classMatch = xmlContent.match(/<class\s+name="([^"]+)"/);

            const packageName = packageMatch ? packageMatch[1].replace(/\//g, '.') : '';
            const fullClassName = classMatch ? classMatch[1].replace(/\//g, '.') : '';
            const className = fullClassName.split('.').pop() || '';

            // Extract overall counters
            const lineCounter = this.extractCounter(xmlContent, 'LINE');
            const branchCounter = this.extractCounter(xmlContent, 'BRANCH');

            const lineCoverage = lineCounter
                ? (lineCounter.covered / (lineCounter.covered + lineCounter.missed)) * 100
                : 0;
            const branchCoverage = branchCounter
                ? (branchCounter.covered / (branchCounter.covered + branchCounter.missed)) * 100
                : 0;

            // Extract method-level coverage
            const methodCoverage = this.extractMethodCoverage(xmlContent);

            // Calculate overall coverage (weighted average)
            const overallCoverage = (lineCoverage + branchCoverage) / 2;

            return {
                className,
                packageName,
                lineCoverage: Math.round(lineCoverage * 100) / 100,
                branchCoverage: Math.round(branchCoverage * 100) / 100,
                methodCoverage,
                overallCoverage: Math.round(overallCoverage * 100) / 100
            };
        } catch (error) {
            console.error('Failed to parse Jacoco XML:', error);
            return null;
        }
    }

    /**
     * Extracts counter values from XML
     */
    private extractCounter(xmlContent: string, type: string): { covered: number; missed: number } | null {
        // Look for report-level counter first
        const reportPattern = new RegExp(
            `<counter\\s+type="${type}"\\s+missed="(\\d+)"\\s+covered="(\\d+)"[^>]*/>`,
            'g'
        );

        let totalMissed = 0;
        let totalCovered = 0;
        let match;

        while ((match = reportPattern.exec(xmlContent)) !== null) {
            totalMissed += parseInt(match[1], 10);
            totalCovered += parseInt(match[2], 10);
        }

        if (totalMissed === 0 && totalCovered === 0) {
            return null;
        }

        return { covered: totalCovered, missed: totalMissed };
    }

    /**
     * Extracts method-level coverage from XML
     */
    private extractMethodCoverage(xmlContent: string): Record<string, { lineCoverage: number; branchCoverage: number; missedLines: number[] }> {
        const methodCoverage: Record<string, { lineCoverage: number; branchCoverage: number; missedLines: number[] }> = {};

        // Match method blocks
        const methodPattern = /<method\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/method>/g;
        let methodMatch;

        while ((methodMatch = methodPattern.exec(xmlContent)) !== null) {
            const methodName = methodMatch[1];
            const methodContent = methodMatch[2];

            // Skip constructors and synthetic methods
            if (methodName === '<init>' || methodName === '<clinit>' || methodName.startsWith('lambda$')) {
                continue;
            }

            // Extract line counter for this method
            const lineMatch = methodContent.match(/<counter\s+type="LINE"\s+missed="(\d+)"\s+covered="(\d+)"[^>]*\/>/);
            const branchMatch = methodContent.match(/<counter\s+type="BRANCH"\s+missed="(\d+)"\s+covered="(\d+)"[^>]*\/>/);

            let lineCov = 100;
            let branchCov = 100;
            const missedLines: number[] = [];

            if (lineMatch) {
                const missed = parseInt(lineMatch[1], 10);
                const covered = parseInt(lineMatch[2], 10);
                lineCov = covered + missed > 0 ? (covered / (covered + missed)) * 100 : 100;
            }

            if (branchMatch) {
                const missed = parseInt(branchMatch[1], 10);
                const covered = parseInt(branchMatch[2], 10);
                branchCov = covered + missed > 0 ? (covered / (covered + missed)) * 100 : 100;
            }

            methodCoverage[methodName] = {
                lineCoverage: Math.round(lineCov * 100) / 100,
                branchCoverage: Math.round(branchCov * 100) / 100,
                missedLines
            };
        }

        return methodCoverage;
    }

    /**
     * Checks if Jacoco is configured in the project
     */
    /**
     * Checks if Jacoco is configured in build file
     * NOTE: This is now optional! The extension can work WITHOUT Jacoco in pom.xml/build.gradle
     * by using command-line plugin invocation.
     */
    async isJacocoConfigured(): Promise<boolean> {
        const buildTool = await this.detectBuildTool();

        if (!buildTool) {
            console.log('[JacocoRunner] No build tool detected');
            return false;
        }

        try {
            if (buildTool === 'gradle') {
                // Check build.gradle for jacoco plugin
                const buildFiles = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(this.workspaceFolder.uri, '{build.gradle,build.gradle.kts}'),
                    null,
                    1
                );

                if (buildFiles.length > 0) {
                    const content = await vscode.workspace.fs.readFile(buildFiles[0]);
                    const text = new TextDecoder().decode(content);
                    const lowerText = text.toLowerCase();
                    const isConfigured = lowerText.includes('jacoco') || lowerText.includes('org.jacoco');
                    console.log('[JacocoRunner] Gradle jacoco in build file:', isConfigured);
                    return isConfigured;
                } else {
                    console.log('[JacocoRunner] No Gradle build file found');
                }
            } else {
                // Check pom.xml for jacoco plugin (case-insensitive)
                const pomFiles = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(this.workspaceFolder.uri, 'pom.xml'),
                    null,
                    1
                );

                if (pomFiles.length > 0) {
                    const content = await vscode.workspace.fs.readFile(pomFiles[0]);
                    const text = new TextDecoder().decode(content);
                    const lowerText = text.toLowerCase();
                    
                    // Check for jacoco-maven-plugin or org.jacoco
                    const hasJacocoPlugin = lowerText.includes('jacoco-maven-plugin') || 
                                          lowerText.includes('org.jacoco');
                    
                    console.log('[JacocoRunner] Maven pom.xml path:', pomFiles[0].fsPath);
                    console.log('[JacocoRunner] Maven jacoco in build file:', hasJacocoPlugin);
                    
                    if (!hasJacocoPlugin) {
                        console.log('[JacocoRunner] ⚠️ Jacoco NOT in pom.xml - will use command-line invocation instead!');
                    }
                    
                    return hasJacocoPlugin;
                } else {
                    console.log('[JacocoRunner] No pom.xml found in workspace');
                }
            }
        } catch (error) {
            console.error('[JacocoRunner] Failed to check Jacoco configuration:', error);
        }

        // Return false but it's OK - we'll use command-line invocation!
        console.log('[JacocoRunner] ℹ️ No Jacoco config found, but extension will inject it via command line');
        return false;
    }

    /**
     * Opens the HTML coverage report in browser
     */
    async openHtmlReport(): Promise<boolean> {
        const buildTool = await this.detectBuildTool();

        if (!buildTool) {
            return false;
        }

        const basePath = this.workspaceFolder.uri.fsPath;
        let htmlReportPath: string;

        if (buildTool === 'gradle') {
            htmlReportPath = path.join(basePath, 'build', 'reports', 'jacoco', 'test', 'html', 'index.html');
        } else {
            htmlReportPath = path.join(basePath, 'target', 'site', 'jacoco', 'index.html');
        }

        try {
            const reportUri = vscode.Uri.file(htmlReportPath);
            await vscode.env.openExternal(reportUri);
            return true;
        } catch (error) {
            console.error('Failed to open HTML report:', error);
            return false;
        }
    }
}
