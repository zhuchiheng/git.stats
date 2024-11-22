"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitContributionAnalyzer = void 0;
const moment_1 = __importDefault(require("moment"));
class GitContributionAnalyzer {
    constructor(git) {
        this.git = git;
    }
    async getContributionStats(startDate, endDate) {
        const logs = await this.git.log(['--numstat', '--pretty=format:"%h|%an|%ad"', '--date=iso']);
        const stats = {};
        for (const commit of logs.all) {
            const [hash, author, dateStr] = commit.hash.replace(/"/g, '').split('|');
            const date = (0, moment_1.default)(dateStr);
            // 只统计指定日期范围内的提交
            if (date.isBefore(startDate) || date.isAfter(endDate)) {
                continue;
            }
            const dateKey = date.format('YYYY-MM-DD');
            // 初始化作者统计数据
            if (!stats[author]) {
                stats[author] = {
                    author,
                    totalCommits: 0,
                    totalInsertions: 0,
                    totalDeletions: 0,
                    totalFiles: 0,
                    dailyStats: {}
                };
            }
            // 初始化日期统计数据
            if (!stats[author].dailyStats[dateKey]) {
                stats[author].dailyStats[dateKey] = {
                    date: dateKey,
                    commits: 0,
                    insertions: 0,
                    deletions: 0,
                    files: 0
                };
            }
            // 更新统计数据
            stats[author].totalCommits++;
            stats[author].dailyStats[dateKey].commits++;
            // 统计文件变更
            const diffStats = this.parseNumstat(String(commit.diff || ''));
            stats[author].totalInsertions += diffStats.insertions;
            stats[author].totalDeletions += diffStats.deletions;
            stats[author].totalFiles += diffStats.files;
            stats[author].dailyStats[dateKey].insertions += diffStats.insertions;
            stats[author].dailyStats[dateKey].deletions += diffStats.deletions;
            stats[author].dailyStats[dateKey].files += diffStats.files;
        }
        return stats;
    }
    parseNumstat(diff) {
        const lines = diff.split('\n').filter(line => line.trim());
        let totalInsertions = 0;
        let totalDeletions = 0;
        for (const line of lines) {
            const [insertions, deletions] = line.split('\t').map(n => parseInt(n) || 0);
            totalInsertions += insertions;
            totalDeletions += deletions;
        }
        return {
            files: lines.length,
            insertions: totalInsertions,
            deletions: totalDeletions
        };
    }
}
exports.GitContributionAnalyzer = GitContributionAnalyzer;
//# sourceMappingURL=gitAnalyzer.js.map