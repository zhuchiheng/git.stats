import * as vscode from 'vscode';
import { simpleGit, SimpleGit } from 'simple-git';
import * as fs from 'fs';
import * as path from 'path';
import moment from 'moment';
import { GitContributionAnalyzer } from './gitAnalyzer';
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
    // Create status bar button
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right,
        1000  // Higher priority to ensure better visibility
    );

    // Configure status bar item
    statusBarItem.text = "$(graph-line) Git Stats";  // Using git-commit icon
    statusBarItem.tooltip = "Click to view your Git contribution statistics";
    statusBarItem.command = 'git-stats.showStats';

    // Only show the button when in a workspace with a Git repository
    const updateStatusBarVisibility = () => {
        if (vscode.workspace.workspaceFolders) {
            statusBarItem.show();
        } else {
            statusBarItem.hide();
        }
    };

    // Update visibility initially and when workspace folders change
    updateStatusBarVisibility();
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => updateStatusBarVisibility())
    );

    // Add status bar item to subscriptions for cleanup
    context.subscriptions.push(statusBarItem);

    let disposable = vscode.commands.registerCommand('git-stats.showStats', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace with a Git repository');
            return;
        }

        try {
            // 查找所有Git仓库
            const gitRepos: {path: string, git: SimpleGit}[] = [];
            
            for (const folder of workspaceFolders) {
                const rootPath = folder.uri.fsPath;
                const git = simpleGit(rootPath);
                
                try {
                    const isRepo = await git.checkIsRepo();
                    if (isRepo) {
                        gitRepos.push({path: rootPath, git});
                    } else {
                        // 递归查找子目录中的Git仓库
                        const subRepos = await findGitRepos(rootPath);
                        gitRepos.push(...subRepos);
                    }
                } catch (error) {
                    console.error(`Error checking repository at ${rootPath}:`, error);
                }
            }

            if (gitRepos.length === 0) {
                vscode.window.showErrorMessage('No Git repositories found in workspace');
                return;
            }

            // 为每个仓库创建分析器实例
            const analyzers = gitRepos.map(repo => new GitContributionAnalyzer(repo.git));
            
            // 创建可视化实例
            const visualization = new ContributionVisualization(context, analyzers, gitRepos);

            // 显示加载消息
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing Git history...",
                cancellable: false
            }, async (progress) => {
                // 分析所有仓库
                const allStats = await Promise.all(
                    analyzers.map((analyzer, index) => 
                        analyzer.getContributionStats(7, undefined, undefined, undefined, gitRepos[index].path)
                    )
                );
                
                // 合并统计结果
                const combinedStats = allStats.reduce((acc, stats) => {
                    for (const author in stats) {
                        if (!acc[author]) {
                            acc[author] = stats[author];
                        } else {
                            // 合并统计
                            acc[author].totalCommits += stats[author].totalCommits;
                            acc[author].totalInsertions += stats[author].totalInsertions;
                            acc[author].totalDeletions += stats[author].totalDeletions;
                            acc[author].totalFiles += stats[author].totalFiles;
                            
                            // 合并每日统计
                            for (const date in stats[author].dailyStats) {
                                if (!acc[author].dailyStats[date]) {
                                    acc[author].dailyStats[date] = stats[author].dailyStats[date];
                                } else {
                                    acc[author].dailyStats[date].commits += stats[author].dailyStats[date].commits;
                                    acc[author].dailyStats[date].insertions += stats[author].dailyStats[date].insertions;
                                    acc[author].dailyStats[date].deletions += stats[author].dailyStats[date].deletions;
                                    acc[author].dailyStats[date].files += stats[author].dailyStats[date].files;
                                }
                            }
                            
                            // 合并小时统计
                            for (const hour in stats[author].hourlyStats) {
                                if (!acc[author].hourlyStats[hour]) {
                                    acc[author].hourlyStats[hour] = stats[author].hourlyStats[hour];
                                } else {
                                    acc[author].hourlyStats[hour].commits += stats[author].hourlyStats[hour].commits;
                                    acc[author].hourlyStats[hour].insertions += stats[author].hourlyStats[hour].insertions;
                                    acc[author].hourlyStats[hour].deletions += stats[author].hourlyStats[hour].deletions;
                                    acc[author].hourlyStats[hour].files += stats[author].hourlyStats[hour].files;
                                }
                            }
                        }
                    }
                    return acc;
                }, {} as Record<string, any>);

                await visualization.show(combinedStats);
            });
        } catch (error) {
            vscode.window.showErrorMessage('Error analyzing Git history: ' + error);
            console.error('Error:', error);
        }
    });

    context.subscriptions.push(disposable);
}
