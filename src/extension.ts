import * as vscode from 'vscode';
import { simpleGit, SimpleGit } from 'simple-git';
import moment from 'moment';
import { GitContributionAnalyzer } from './gitAnalyzer';
import { ContributionVisualization } from './visualization';

export function activate(context: vscode.ExtensionContext) {
    console.log('Code Activity Tracker is now active!');

    let disposable = vscode.commands.registerCommand('code-activity-tracker.showStats', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace with a Git repository');
            return;
        }

        const rootPath = workspaceFolders[0].uri.fsPath;
        console.log(`Analyzing repository at: ${rootPath}`);
        const git: SimpleGit = simpleGit(rootPath);

        try {
            // 检查是否是Git仓库
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                vscode.window.showErrorMessage('This workspace is not a Git repository');
                return;
            }
            console.log('Valid Git repository confirmed');

            // 创建分析器实例
            const analyzer = new GitContributionAnalyzer(git);
            
            // 获取默认时间范围（最近一周）的统计数据
            const stats = await analyzer.getContributionStats();
            
            // 创建可视化实例并显示数据
            const visualization = new ContributionVisualization(context.extensionUri);
            
            // 显示加载消息
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing Git history...",
                cancellable: false
            }, async (progress) => {
                await visualization.show(stats);
            });

            // 处理时间范围变化
            visualization.onTimeRangeChange(async (days: number) => {
                const endDate = moment.utc();
                const startDate = moment.utc().subtract(days, 'days');
                
                // 显示加载消息
                vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Updating statistics...",
                    cancellable: false
                }, async (progress) => {
                    const newStats = await analyzer.getContributionStats(startDate, endDate);
                    await visualization.updateStats(newStats);
                });
            });

        } catch (error) {
            vscode.window.showErrorMessage('Error analyzing Git history: ' + error);
        }
    });

    context.subscriptions.push(disposable);
}
