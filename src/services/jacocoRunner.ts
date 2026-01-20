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
     */
    private async executeTestsWithCoverage(buildTool: BuildTool, testClassName?: string): Promise<void> {
        return new Promise((resolve, reject) => {
            let command: string;
            let args: string[];

            if (buildTool === 'gradle') {
                command = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
                args = ['test', 'jacocoTestReport'];
                if (testClassName) {
                    args.push('--tests', testClassName);
                }
            } else {
                command = 'mvn';
                args = ['test', 'jacoco:report'];
                if (testClassName) {
                    args.push(`-Dtest=${testClassName}`);
                }
            }

            const child = spawn(command, args, {
                cwd: this.workspaceFolder.uri.fsPath,
                shell: false,
                env: { ...process.env },
                windowsHide: true
            });

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
                if (code === 0) {
                    resolve();
                } else {
                    // Check if tests ran but some failed (still produces coverage)
                    if (stdout.includes('BUILD') || stderr.includes('BUILD')) {
                        resolve(); // Coverage report might still be generated
                    } else {
                        reject(new Error(`Command exited with code ${code}: ${stderr || stdout}`));
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
    async isJacocoConfigured(): Promise<boolean> {
        const buildTool = await this.detectBuildTool();

        if (!buildTool) {
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
                    return text.includes('jacoco') || text.includes('JaCoCo');
                }
            } else {
                // Check pom.xml for jacoco plugin
                const pomFiles = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(this.workspaceFolder.uri, 'pom.xml'),
                    null,
                    1
                );

                if (pomFiles.length > 0) {
                    const content = await vscode.workspace.fs.readFile(pomFiles[0]);
                    const text = new TextDecoder().decode(content);
                    return text.includes('jacoco');
                }
            }
        } catch (error) {
            console.error('Failed to check Jacoco configuration:', error);
        }

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
