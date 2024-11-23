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
            
            // 添加时间范围选择
            const timeRanges = ['Last Week', 'Last Month', 'Last 3 Months', 'Last Year'];
            const selectedRange = await vscode.window.showQuickPick(timeRanges, {
                placeHolder: 'Select Time Range'
            });

            if (!selectedRange) {
                console.log('User cancelled time range selection');
                return;
            }
            console.log(`Selected time range: ${selectedRange}`);

            // 根据选择设置时间范围
            const endDate = moment.utc();
            let startDate: moment.Moment;
            switch (selectedRange) {
                case 'Last Week':
                    startDate = moment.utc().subtract(7, 'days');
                    break;
                case 'Last Month':
                    startDate = moment.utc().subtract(30, 'days');
                    break;
                case 'Last 3 Months':
                    startDate = moment.utc().subtract(90, 'days');
                    break;
                case 'Last Year':
                    startDate = moment.utc().subtract(365, 'days');
                    break;
                default:
                    startDate = moment.utc().subtract(30, 'days');
            }
            
            // 显示加载消息
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing Git history...",
                cancellable: false
            }, async (progress) => {
                // 获取统计数据
                const stats = await analyzer.getContributionStats(startDate, endDate);
                
                // 创建可视化实例并显示数据
                const visualization = new ContributionVisualization(context);
                visualization.showContributionStats(stats);
            });

        } catch (error) {
            vscode.window.showErrorMessage('Error analyzing Git history: ' + error);
        }
    });

    context.subscriptions.push(disposable);
}
