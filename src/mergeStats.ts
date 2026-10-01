import moment from 'moment';
import {
    AuthorStats,
    ContributionResult,
    DailyStats,
    FileChangeStats,
    OwnershipEntry,
    computeStreakStats
} from './gitAnalyzer';
import { emptyHealthRaw, mergeHealthRaw } from './healthChecks';
import type { DirActivityMap } from './teamSignals';

/** Max entries kept per day/hour key in commit/heatmap detail maps (payload bounding). */
export const MAX_DETAILS_PER_KEY = 50;
/** Max distinct words kept in the merged word frequency map. */
export const MAX_WORD_FREQ_ENTRIES = 100;

/**
 * Escape a plain-text value for safe interpolation into HTML content
 * (attribute values included — quotes are escaped).
 */
export function escapeHtml(text: string): string {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Serialize a value for embedding inside an inline <script> block.
 * Escapes characters that could close the script tag or break parsing
 * (<, >, &, U+2028, U+2029) while remaining valid JSON.
 */
export function toSafeJson(value: unknown): string {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

/**
 * Human-readable error text for logs and user-facing messages.
 */
export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function emptyResult(): ContributionResult {
    return { authorStats: {}, fileStats: [], ownership: [], wordFreq: {}, commitDetails: {}, heatmapDetails: {}, health: emptyHealthRaw(), dirActivity: {} };
}

/**
 * Merge per-directory author activity: commit counts add up, first/last dates
 * widen across repos (ISO date strings compare correctly as strings).
 */
function mergeDirActivity(target: DirActivityMap, source: DirActivityMap | undefined): void {
    if (!source) {
        return;
    }
    for (const [dir, byAuthor] of Object.entries(source)) {
        const targetByAuthor = target[dir] || (target[dir] = {});
        for (const [author, activity] of Object.entries(byAuthor || {})) {
            if (!activity) {
                continue;
            }
            const existing = targetByAuthor[author];
            if (!existing) {
                targetByAuthor[author] = {
                    commits: activity.commits || 0,
                    firstDate: activity.firstDate || '',
                    lastDate: activity.lastDate || ''
                };
                continue;
            }
            existing.commits += activity.commits || 0;
            if (activity.firstDate && (!existing.firstDate || activity.firstDate < existing.firstDate)) {
                existing.firstDate = activity.firstDate;
            }
            if (activity.lastDate && activity.lastDate > existing.lastDate) {
                existing.lastDate = activity.lastDate;
            }
        }
    }
}

function mergeDailyStats(target: { [date: string]: DailyStats }, source: { [date: string]: DailyStats }): void {
    for (const [key, stats] of Object.entries(source)) {
        const t = target[key];
        if (t) {
            t.commits += stats.commits || 0;
            t.insertions += stats.insertions || 0;
            t.deletions += stats.deletions || 0;
            t.files += stats.files || 0;
        } else {
            target[key] = { ...stats };
        }
    }
}

/**
 * Merge multiple per-repo ContributionResults into one.
 * - Author totals/daily/hourly/weekly-hourly buckets are summed per author name.
 * - Each author's date range is widened to cover all repos and streaks are
 *   recomputed over the widened range (sparse dailyStats safe).
 * - File stats and ownership entries are merged by path in O(n) via Maps,
 *   with primary author/percentage recomputed.
 * - Word frequency is summed and capped to the top MAX_WORD_FREQ_ENTRIES.
 * - Commit/heatmap details are concatenated per key, capped at MAX_DETAILS_PER_KEY.
 */
export function mergeResults(results: ContributionResult[]): ContributionResult {
    const valid = results.filter(Boolean);
    if (valid.length === 0) {
        return emptyResult();
    }
    if (valid.length === 1) {
        return valid[0];
    }

    const authorStats: { [author: string]: AuthorStats } = {};
    const authorRanges = new Map<string, { start: moment.Moment; end: moment.Moment }>();
    const fileMap = new Map<string, FileChangeStats>();
    const ownershipMap = new Map<string, OwnershipEntry>();
    const wordFreq: { [word: string]: number } = {};
    const commitDetails: ContributionResult['commitDetails'] = {};
    const heatmapDetails: ContributionResult['heatmapDetails'] = {};
    const health = emptyHealthRaw();
    const dirActivity: DirActivityMap = {};

    const pushDetails = <T>(target: { [key: string]: T[] }, source: { [key: string]: T[] }) => {
        for (const [key, entries] of Object.entries(source)) {
            if (!entries || entries.length === 0) {
                continue;
            }
            const list = target[key];
            if (list) {
                if (list.length < MAX_DETAILS_PER_KEY) {
                    list.push(...entries.slice(0, MAX_DETAILS_PER_KEY - list.length));
                }
            } else {
                target[key] = entries.slice(0, MAX_DETAILS_PER_KEY);
            }
        }
    };

    for (const result of valid) {
        for (const [name, stats] of Object.entries(result.authorStats || {})) {
            const range = authorRanges.get(name);
            if (!authorStats[name]) {
                authorStats[name] = stats;
                authorRanges.set(name, {
                    start: (stats.startDate || moment(0)).clone(),
                    end: (stats.endDate || moment(0)).clone()
                });
            } else {
                const target = authorStats[name];
                target.totalCommits += stats.totalCommits || 0;
                target.totalInsertions += stats.totalInsertions || 0;
                target.totalDeletions += stats.totalDeletions || 0;
                target.totalFiles += stats.totalFiles || 0;
                target.email = target.email || stats.email || '';
                mergeDailyStats(target.dailyStats, stats.dailyStats || {});
                mergeDailyStats(target.hourlyStats, stats.hourlyStats || {});
                if (Array.isArray(stats.weeklyHourly)) {
                    if (!Array.isArray(target.weeklyHourly)) {
                        target.weeklyHourly = Array.from({ length: 7 }, () => new Array(24).fill(0));
                    }
                    for (let d = 0; d < 7; d++) {
                        for (let h = 0; h < 24; h++) {
                            target.weeklyHourly[d][h] += (stats.weeklyHourly[d] && stats.weeklyHourly[d][h]) || 0;
                        }
                    }
                }
                const start = (stats.startDate || moment(0)).clone();
                const end = (stats.endDate || moment(0)).clone();
                if (start.isBefore(range!.start)) {
                    range!.start = start;
                }
                if (end.isAfter(range!.end)) {
                    range!.end = end;
                }
            }
        }

        for (const file of result.fileStats || []) {
            if (!file || !file.file) {
                continue;
            }
            const existing = fileMap.get(file.file);
            if (existing) {
                existing.totalCommits += file.totalCommits || 0;
                existing.totalInsertions += file.totalInsertions || 0;
                existing.totalDeletions += file.totalDeletions || 0;
            } else {
                fileMap.set(file.file, { ...file });
            }
        }

        for (const entry of result.ownership || []) {
            if (!entry || !entry.path) {
                continue;
            }
            const existing = ownershipMap.get(entry.path);
            if (!existing) {
                ownershipMap.set(entry.path, {
                    ...entry,
                    linesByAuthor: { ...(entry.linesByAuthor || {}) }
                });
                continue;
            }
            for (const [author, lines] of Object.entries(entry.linesByAuthor || {})) {
                existing.linesByAuthor[author] = (existing.linesByAuthor[author] || 0) + lines;
            }
        }

        for (const [word, count] of Object.entries(result.wordFreq || {})) {
            wordFreq[word] = (wordFreq[word] || 0) + count;
        }

        pushDetails(commitDetails, result.commitDetails || {});
        pushDetails(heatmapDetails, result.heatmapDetails || {});
        mergeHealthRaw(health, result.health);
        mergeDirActivity(dirActivity, result.dirActivity);
    }

    // Finalize authors: widened ranges + streaks recomputed over the merged data.
    for (const [name, range] of authorRanges) {
        const stats = authorStats[name];
        stats.startDate = range.start;
        stats.endDate = range.end;
        const streaks = computeStreakStats(stats.dailyStats, range.start, range.end);
        stats.currentStreak = streaks.currentStreak;
        stats.longestStreak = streaks.longestStreak;
    }

    // Recompute ownership primary author/percentage over merged line counts.
    const ownership: OwnershipEntry[] = Array.from(ownershipMap.values()).map(entry => {
        let total = 0;
        let primaryAuthor = '';
        let primaryLines = -1;
        for (const [author, lines] of Object.entries(entry.linesByAuthor)) {
            total += lines;
            if (lines > primaryLines) {
                primaryLines = lines;
                primaryAuthor = author;
            }
        }
        return {
            ...entry,
            totalLines: total,
            primaryAuthor,
            primaryAuthorPercentage: total > 0 ? Math.round((primaryLines / total) * 100) : 0
        };
    });

    const fileStats: FileChangeStats[] = Array.from(fileMap.values())
        .sort((a, b) => b.totalCommits - a.totalCommits);

    const wordFreqEntries = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_WORD_FREQ_ENTRIES);
    const mergedWordFreq: { [word: string]: number } = {};
    for (const [word, count] of wordFreqEntries) {
        mergedWordFreq[word] = count;
    }

    return {
        authorStats,
        fileStats,
        ownership,
        wordFreq: mergedWordFreq,
        commitDetails,
        heatmapDetails,
        health,
        dirActivity
    };
}
