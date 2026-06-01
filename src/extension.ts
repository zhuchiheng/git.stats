import * as vscode from 'vscode';
import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { AuthorStats, DailyStats, ContributionResult, FileChangeStats, OwnershipEntry, GitContributionAnalyzer } from './gitAnalyzer';
import { ContributionVisualization } from './visualization';

export async function findGitRepos(rootPath: string): Promise<{path: string, git: SimpleGit}[]> {
    const gitRepos: {path: string, git: SimpleGit}[] = [];

    async function scanDirectory(dir: string) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === '.git') {
                    const repoPath = path.dirname(fullPath);
                    gitRepos.push({
                        path: repoPath,
                        git: simpleGit(repoPath)
                    });
                } else {
                    await scanDirectory(fullPath);
                }
            }
        }
    }

    await scanDirectory(rootPath);
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

    let disposable = vscode.commands.registerCommand('git-stats.showStats', async () => {
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

            const visualization = new ContributionVisualization(context, analyzers, gitRepos);

            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing Git history...",
                cancellable: false
            }, async (progress) => {
                const allResults = await Promise.all(
                    analyzers.map((analyzer, index) =>
                        analyzer.getContributionStats(0, undefined, undefined, undefined, gitRepos[index].path)
                    )
                );

                const combinedResult: ContributionResult = allResults.reduce((acc, result) => {
                    for (const author in result.authorStats) {
                        if (!acc.authorStats[author]) {
                            acc.authorStats[author] = result.authorStats[author];
                        } else {
                            const s = result.authorStats[author];
                            const t = acc.authorStats[author];
                            t.totalCommits += s.totalCommits;
                            t.totalInsertions += s.totalInsertions;
                            t.totalDeletions += s.totalDeletions;
                            t.totalFiles += s.totalFiles;

                            for (const date in s.dailyStats) {
                                if (!t.dailyStats[date]) {
                                    t.dailyStats[date] = s.dailyStats[date];
                                } else {
                                    t.dailyStats[date].commits += s.dailyStats[date].commits;
                                    t.dailyStats[date].insertions += s.dailyStats[date].insertions;
                                    t.dailyStats[date].deletions += s.dailyStats[date].deletions;
                                    t.dailyStats[date].files += s.dailyStats[date].files;
                                }
                            }

                            for (const hour in s.hourlyStats) {
                                if (!t.hourlyStats[hour]) {
                                    t.hourlyStats[hour] = s.hourlyStats[hour];
                                } else {
                                    t.hourlyStats[hour].commits += s.hourlyStats[hour].commits;
                                    t.hourlyStats[hour].insertions += s.hourlyStats[hour].insertions;
                                    t.hourlyStats[hour].deletions += s.hourlyStats[hour].deletions;
                                    t.hourlyStats[hour].files += s.hourlyStats[hour].files;
                                }
                            }

                            if (s.weeklyHourly) {
                                if (!t.weeklyHourly) {
                                    t.weeklyHourly = Array.from({ length: 7 }, () => new Array(24).fill(0));
                                }
                                for (let d = 0; d < 7; d++) {
                                    for (let h = 0; h < 24; h++) {
                                        t.weeklyHourly[d][h] += (s.weeklyHourly[d]?.[h] || 0);
                                    }
                                }
                            }
                        }
                    }

                    for (const fs of result.fileStats) {
                        const existing = acc.fileStats.find(f => f.file === fs.file);
                        if (existing) {
                            existing.totalCommits += fs.totalCommits;
                            existing.totalInsertions += fs.totalInsertions;
                            existing.totalDeletions += fs.totalDeletions;
                        } else {
                            acc.fileStats.push({ ...fs });
                        }
                    }

                    for (const ow of result.ownership) {
                        const existing = acc.ownership.find(o => o.path === ow.path);
                        if (existing) {
                            existing.totalLines += ow.totalLines;
                            for (const [author, lines] of Object.entries(ow.linesByAuthor)) {
                                existing.linesByAuthor[author] = (existing.linesByAuthor[author] || 0) + lines;
                            }
                            let maxLines = 0;
                            let primaryAuthor = '';
                            for (const [author, lines] of Object.entries(existing.linesByAuthor)) {
                                if (lines > maxLines) {
                                    maxLines = lines;
                                    primaryAuthor = author;
                                }
                            }
                            existing.primaryAuthor = primaryAuthor;
                            existing.primaryAuthorPercentage = existing.totalLines > 0 ? Math.round((maxLines / existing.totalLines) * 100) : 0;
                        } else {
                            acc.ownership.push({ ...ow, linesByAuthor: { ...ow.linesByAuthor } });
                        }
                    }

                    for (const [word, count] of Object.entries(result.wordFreq || {})) {
                        acc.wordFreq[word] = (acc.wordFreq[word] || 0) + count;
                    }

                    return acc;
                }, { authorStats: {}, fileStats: [], ownership: [], wordFreq: {} });

                combinedResult.fileStats.sort((a, b) => b.totalCommits - a.totalCommits);
                combinedResult.ownership.sort((a, b) => b.totalLines - a.totalLines);

                await visualization.show(combinedResult);
            });
        } catch (error) {
            vscode.window.showErrorMessage('Error analyzing Git history: ' + error);
            console.error('Error:', error);
        }
    });

    context.subscriptions.push(disposable);
}
