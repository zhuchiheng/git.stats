"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const simple_git_1 = require("simple-git");
const moment_1 = __importDefault(require("moment"));
const gitAnalyzer_1 = require("./gitAnalyzer");
const visualization_1 = require("./visualization");
function activate(context) {
    console.log('Code Activity Tracker is now active!');
    let disposable = vscode.commands.registerCommand('code-activity-tracker.showStats', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace with a Git repository');
            return;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        const git = (0, simple_git_1.simpleGit)(rootPath);
        try {
            // 检查是否是Git仓库
            const isRepo = await git.checkIsRepo();
            if (!isRepo) {
                vscode.window.showErrorMessage('This workspace is not a Git repository');
                return;
            }
            // 创建分析器实例
            const analyzer = new gitAnalyzer_1.GitContributionAnalyzer(git);
            // 获取过去30天的统计数据
            const endDate = (0, moment_1.default)();
            const startDate = (0, moment_1.default)().subtract(30, 'days');
            // 显示加载消息
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing Git history...",
                cancellable: false
            }, async (progress) => {
                // 获取统计数据
                const stats = await analyzer.getContributionStats(startDate, endDate);
                // 创建可视化实例并显示数据
                const visualization = new visualization_1.ContributionVisualization(context);
                visualization.showContributionStats(stats);
            });
        }
        catch (error) {
            vscode.window.showErrorMessage('Error analyzing Git history: ' + error);
        }
    });
    context.subscriptions.push(disposable);
}
exports.activate = activate;
//# sourceMappingURL=extension.js.map