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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findGitRepos = findGitRepos;
exports.activate = activate;
const vscode = __importStar(require("vscode"));
const simple_git_1 = require("simple-git");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const gitAnalyzer_1 = require("./gitAnalyzer");
const visualization_1 = require("./visualization");
function findGitRepos(rootPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const gitRepos = [];
        function scanDirectory(dir) {
            return __awaiter(this, void 0, void 0, function* () {
                const entries = yield fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (entry.name === '.git') {
                            const repoPath = path.dirname(fullPath);
                            gitRepos.push({
                                path: repoPath,
                                git: (0, simple_git_1.simpleGit)(repoPath)
                            });
                        }
                        else {
                            yield scanDirectory(fullPath);
                        }
                    }
                }
            });
        }
        yield scanDirectory(rootPath);
        return gitRepos;
    });
}
function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1000);
    statusBarItem.text = "$(graph-line) Git Stats";
    statusBarItem.tooltip = "Click to view your Git contribution statistics";
    statusBarItem.command = 'git-stats.showStats';
    const updateStatusBarVisibility = () => {
        if (vscode.workspace.workspaceFolders) {
            statusBarItem.show();
        }
        else {
            statusBarItem.hide();
        }
    };
    updateStatusBarVisibility();
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => updateStatusBarVisibility()));
    context.subscriptions.push(statusBarItem);
    let disposable = vscode.commands.registerCommand('git-stats.showStats', () => __awaiter(this, void 0, void 0, function* () {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showErrorMessage('Please open a workspace with a Git repository');
            return;
        }
        try {
            const gitRepos = [];
            for (const folder of workspaceFolders) {
                const rootPath = folder.uri.fsPath;
                const git = (0, simple_git_1.simpleGit)(rootPath);
                try {
                    const isRepo = yield git.checkIsRepo();
                    if (isRepo) {
                        gitRepos.push({ path: rootPath, git });
                    }
                    else {
                        const subRepos = yield findGitRepos(rootPath);
                        gitRepos.push(...subRepos);
                    }
                }
                catch (error) {
                    console.error(`Error checking repository at ${rootPath}:`, error);
                }
            }
            if (gitRepos.length === 0) {
                vscode.window.showErrorMessage('No Git repositories found in workspace. Please ensure:\n1. The workspace contains at least one Git repository\n2. You have read permissions for the .git directory');
                return;
            }
            const analyzers = gitRepos.map(repo => new gitAnalyzer_1.GitContributionAnalyzer(repo.git));
            const visualization = new visualization_1.ContributionVisualization(context, analyzers, gitRepos);
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Analyzing Git history...",
                cancellable: false
            }, (progress) => __awaiter(this, void 0, void 0, function* () {
                const allStats = yield Promise.all(analyzers.map((analyzer, index) => analyzer.getContributionStats(7, undefined, undefined, undefined, gitRepos[index].path)));
                const combinedStats = allStats.reduce((acc, stats) => {
                    for (const author in stats) {
                        if (!acc[author]) {
                            acc[author] = stats[author];
                        }
                        else {
                            acc[author].totalCommits += stats[author].totalCommits;
                            acc[author].totalInsertions += stats[author].totalInsertions;
                            acc[author].totalDeletions += stats[author].totalDeletions;
                            acc[author].totalFiles += stats[author].totalFiles;
                            for (const date in stats[author].dailyStats) {
                                if (!acc[author].dailyStats[date]) {
                                    acc[author].dailyStats[date] = stats[author].dailyStats[date];
                                }
                                else {
                                    acc[author].dailyStats[date].commits += stats[author].dailyStats[date].commits;
                                    acc[author].dailyStats[date].insertions += stats[author].dailyStats[date].insertions;
                                    acc[author].dailyStats[date].deletions += stats[author].dailyStats[date].deletions;
                                    acc[author].dailyStats[date].files += stats[author].dailyStats[date].files;
                                }
                            }
                            for (const hour in stats[author].hourlyStats) {
                                if (!acc[author].hourlyStats[hour]) {
                                    acc[author].hourlyStats[hour] = stats[author].hourlyStats[hour];
                                }
                                else {
                                    acc[author].hourlyStats[hour].commits += stats[author].hourlyStats[hour].commits;
                                    acc[author].hourlyStats[hour].insertions += stats[author].hourlyStats[hour].insertions;
                                    acc[author].hourlyStats[hour].deletions += stats[author].hourlyStats[hour].deletions;
                                    acc[author].hourlyStats[hour].files += stats[author].hourlyStats[hour].files;
                                }
                            }
                        }
                    }
                    return acc;
                }, {});
                yield visualization.show(combinedStats);
            }));
        }
        catch (error) {
            vscode.window.showErrorMessage('Error analyzing Git history: ' + error);
            console.error('Error:', error);
        }
    }));
    context.subscriptions.push(disposable);
}
//# sourceMappingURL=extension.js.map