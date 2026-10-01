import * as vscode from 'vscode';
import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import { GitContributionAnalyzer } from './gitAnalyzer';
import { ContributionVisualization } from './visualization';
import { formatError, mergeResults } from './mergeStats';

/** Directories never worth descending into while looking for nested repos. */
const REPO_SCAN_SKIP_DIRS = new Set([
    '.git',
    '.hg',
    '.svn',
    '.github',
    '.idea',
    '.vscode',
    '.vscode-test',
    'node_modules',
    'bower_components',
    'vendor',
    'out',
    'dist',
    'build',
    'target',
    'coverage',
    '.venv',
    'venv',
    'env',
    '__pycache__',
    '.gradle',
    '.cache',
    '.git.stats'
]);

/** Maximum directory depth scanned below each workspace folder (0 = root itself). */
const REPO_SCAN_MAX_DEPTH = 3;

export async function findGitRepos(rootPath: string): Promise<{path: string, git: SimpleGit}[]> {
    const gitRepos: {path: string, git: SimpleGit}[] = [];

    async function scanDirectory(dir: string, depth: number) {
        if (depth > REPO_SCAN_MAX_DEPTH) {
            return;
        }
        let entries: fs.Dirent[];
        try {
            entries = await fs.promises.readdir(dir, { withFileTypes: true });
        } catch {
            return; // unreadable directory — skip silently
        }
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.git') {
                    const repoPath = path.dirname(fullPath);
                    gitRepos.push({
                        path: repoPath,
                        git: simpleGit(repoPath)
                    });
                } else if (!REPO_SCAN_SKIP_DIRS.has(entry.name)) {
                    await scanDirectory(fullPath, depth + 1);
                }
            }
        }
    }

    await scanDirectory(rootPath, 0);
    return gitRepos;
}

export function activate(context: vscode.ExtensionContext) {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        1000
    );

    statusBarItem.text = "$(graph-line) Git Stats";
    statusBarItem.tooltip = "Click to view your Git contribution statistics";
    statusBarItem.command = 'git-stats.showStats';

    const updateStatusBarVisibility = () => {
        if (vscode.workspace.workspaceFolders) {
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    };

    updateStatusBarVisibility();
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => updateStatusBarVisibility())
    );

    context.subscriptions.push(statusBarItem);

    const disposable = vscode.commands.registerCommand('git-stats.showStats', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace with a Git repository');
            return;
        }

        try {
            const gitRepos: {path: string, git: SimpleGit}[] = [];

            for (const folder of workspaceFolders) {
                const rootPath = folder.uri.fsPath;
                const git = simpleGit(rootPath);

                try {
                    const isRepo = await git.checkIsRepo();
                    if (isRepo) {
                        gitRepos.push({path: rootPath, git});
                    } else {
                        const subRepos = await findGitRepos(rootPath);
                        gitRepos.push(...subRepos);
                    }
                } catch (error) {
                    console.error(`Error checking repository at ${rootPath}:`, error);
                }
            }

            if (gitRepos.length === 0) {
                vscode.window.showErrorMessage('No Git repositories found in workspace. Please ensure:\n1. The workspace contains at least one Git repository\n2. You have read permissions for the .git directory');
                return;
            }

            const analyzers = gitRepos.map(repo => new GitContributionAnalyzer(repo.git));

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Git Stats',
                cancellable: true
            }, async (progress, token) => {
                // Pick the initial branch before the first analysis so the
                // primary analysis and the panel agree from the start.
                const branchList = await analyzers[0].getBranches();
                const initialBranch = branchList.includes('main') ? 'main' : '--all';

                progress.report({ message: 'Analyzing Git history...' });

                const cancellation = new Promise<never>((_, reject) => {
                    token.onCancellationRequested(() => reject(new vscode.CancellationError()));
                });

                const allResults = await Promise.race([
                    Promise.all(analyzers.map((analyzer, index) => {
                        progress.report({ message: `Analyzing ${gitRepos[index].path}...` });
                        return analyzer.getContributionStats(0, undefined, undefined, undefined, initialBranch);
                    })),
                    cancellation
                ]);

                progress.report({ message: 'Building visualization...' });

                const merged = mergeResults(allResults);
                const visualization = new ContributionVisualization(context, analyzers, gitRepos, initialBranch, branchList);
                await visualization.show(merged);
            });
        } catch (error) {
            if (error instanceof vscode.CancellationError) {
                return; // user cancelled — nothing to report
            }
            console.error('Error:', error);
            vscode.window.showErrorMessage('Error analyzing Git history: ' + formatError(error));
        }
    });

    context.subscriptions.push(disposable);
}
