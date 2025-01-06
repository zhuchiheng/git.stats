import * as vscode from 'vscode';
import { simpleGit, SimpleGit } from 'simple-git';
import moment from 'moment';
import { GitContributionAnalyzer } from './gitAnalyzer';
import { ContributionVisualization } from './visualization';

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

        const rootPath = workspaceFolders[0].uri.fsPath;
        // console.log(`Analyzing repository at: ${rootPath}`);
        const git: SimpleGit = simpleGit(rootPath);

        try {
            // 检查是否是Git仓库
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                vscode.window.showErrorMessage('This workspace is not a Git repository');
                return;
            }
            // console.log('Valid Git repository confirmed');

            // 创建分析器实例
            const gitAnalyzer = new GitContributionAnalyzer(git);

            // 获取默认时间范围（最近一周）的统计数据
            // const stats = await gitAnalyzer.getContributionStats();

            // 创建可视化实例
            const visualization = new ContributionVisualization(context, gitAnalyzer);

            // 显示加载消息
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing Git history...",
                cancellable: false
            }, async (progress) => {
                const stats = await gitAnalyzer.getContributionStats();
                await visualization.show(stats);
            });
        } catch (error) {
            vscode.window.showErrorMessage('Error analyzing Git history: ' + error);
            // console.error('Error:', error);
        }
    });

    context.subscriptions.push(disposable);
}
