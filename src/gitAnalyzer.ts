import { SimpleGit } from 'simple-git';
import moment from 'moment';

export interface DailyStats {
    date: string;
    commits: number;
    insertions: number;
    deletions: number;
    files: number;
}

export interface AuthorStats {
    author: string;
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
    totalFiles: number;
    dailyStats: { [date: string]: DailyStats };
    startDate: moment.Moment;
    endDate: moment.Moment;
}

export class GitContributionAnalyzer {
    private git: SimpleGit;

    constructor(git: SimpleGit) {
        this.git = git;
    }

    async getContributionStats(startDate: moment.Moment, endDate: moment.Moment): Promise<{ [author: string]: AuthorStats }> {
        try {
            const logs = await this.git.log(['--numstat', '--pretty=format:"%h|%an|%aI"']);
            const stats: { [author: string]: AuthorStats } = {};

            for (const commit of logs.all) {
                const [hash, author, dateStr] = commit.hash.replace(/"/g, '').split('|');
                const date = moment(dateStr);

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
                        dailyStats: {},
                        startDate: startDate.clone(),
                        endDate: endDate.clone()
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
        } catch (error) {
            console.error('Error analyzing git history:', error);
            throw error;
        }
    }

    private parseNumstat(diff: string): { files: number; insertions: number; deletions: number } {
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
