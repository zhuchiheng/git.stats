import { describe, it, expect } from 'vitest';
import moment from 'moment';
import {
    AuthorStats,
    ContributionResult,
    DailyStats,
    OwnershipEntry,
    computeStreakStats
} from '../gitAnalyzer';
import { MAX_WORD_FREQ_ENTRIES, escapeHtml, formatError, mergeResults, toSafeJson } from '../mergeStats';

function daily(commits: number, insertions = 0, deletions = 0, files = 0): DailyStats {
    return { commits, insertions, deletions, files };
}

function makeAuthor(name: string, overrides: Partial<AuthorStats> = {}): AuthorStats {
    return {
        author: name,
        email: name.toLowerCase() + '@example.com',
        startDate: moment('2024-01-01', 'YYYY-MM-DD'),
        endDate: moment('2024-01-05', 'YYYY-MM-DD'),
        totalCommits: 0,
        totalInsertions: 0,
        totalDeletions: 0,
        totalFiles: 0,
        dailyStats: {},
        hourlyStats: {},
        weeklyHourly: Array.from({ length: 7 }, () => new Array(24).fill(0)),
        currentStreak: 0,
        longestStreak: 0,
        ...overrides
    };
}

describe('escapeHtml', () => {
    it('escapes html-significant characters', () => {
        expect(escapeHtml('<img src=x onerror="alert(1)\'&>')).toBe(
            '&lt;img src=x onerror=&quot;alert(1)&#39;&amp;&gt;'
        );
    });

    it('leaves safe text untouched', () => {
        expect(escapeHtml('plain text 123')).toBe('plain text 123');
    });
});

describe('toSafeJson', () => {
    it('escapes script-breaking characters while staying valid JSON', () => {
        const out = toSafeJson({ a: '</script><script>alert(1)</script>' });
        expect(out.includes('</script>')).toBe(false);
        expect(JSON.parse(out)).toEqual({ a: '</script><script>alert(1)</script>' });
    });
});

describe('formatError', () => {
    it('returns the message for Error instances', () => {
        expect(formatError(new Error('boom'))).toBe('boom');
    });

    it('stringifies non-Error values', () => {
        expect(formatError('plain')).toBe('plain');
    });
});

describe('mergeResults', () => {
    it('returns an empty result for an empty array', () => {
        const merged = mergeResults([]);
        expect(merged.authorStats).toEqual({});
        expect(merged.fileStats).toEqual([]);
        expect(merged.ownership).toEqual([]);
        expect(merged.wordFreq).toEqual({});
    });

    it('passes a single result through unchanged', () => {
        const result: ContributionResult = {
            authorStats: { Alice: makeAuthor('Alice', { totalCommits: 3 }) },
            fileStats: [{ file: 'src/a.ts', totalCommits: 2, totalInsertions: 10, totalDeletions: 1 }],
            ownership: [],
            wordFreq: { foo: 1 },
            commitDetails: {},
            heatmapDetails: {}
        };
        expect(mergeResults([result])).toBe(result);
    });

    it('ignores null entries and passes the only valid result through', () => {
        const result: ContributionResult = {
            authorStats: {},
            fileStats: [],
            ownership: [],
            wordFreq: {},
            commitDetails: {},
            heatmapDetails: {}
        };
        expect(mergeResults([null as unknown as ContributionResult, result])).toBe(result);
    });

    it('sums author totals and merges daily stats across repos', () => {
        const r1: ContributionResult = {
            authorStats: {
                Alice: makeAuthor('Alice', {
                    totalCommits: 10,
                    totalInsertions: 100,
                    totalDeletions: 50,
                    totalFiles: 4,
                    dailyStats: { '2024-01-01': daily(3, 30, 10, 2) },
                    weeklyHourly: (() => {
                        const g = Array.from({ length: 7 }, () => new Array(24).fill(0));
                        g[1][9] = 2;
                        return g;
                    })(),
                    currentStreak: 99,
                    longestStreak: 99
                })
            },
            fileStats: [{ file: 'src/a.ts', totalCommits: 3, totalInsertions: 30, totalDeletions: 10 }],
            ownership: [],
            wordFreq: { foo: 2 },
            commitDetails: {},
            heatmapDetails: {}
        };
        const r2: ContributionResult = {
            authorStats: {
                Alice: makeAuthor('Alice', {
                    startDate: moment('2024-01-02', 'YYYY-MM-DD'),
                    endDate: moment('2024-01-08', 'YYYY-MM-DD'),
                    totalCommits: 5,
                    totalInsertions: 60,
                    totalDeletions: 40,
                    totalFiles: 2,
                    dailyStats: { '2024-01-01': daily(2, 10, 0, 1), '2024-01-02': daily(1, 5, 0, 1) },
                    currentStreak: 99,
                    longestStreak: 99
                })
            },
            fileStats: [{ file: 'src/a.ts', totalCommits: 2, totalInsertions: 20, totalDeletions: 5 }],
            ownership: [],
            wordFreq: { foo: 1, bar: 1 },
            commitDetails: {},
            heatmapDetails: {}
        };

        const merged = mergeResults([r1, r2]);
        const alice = merged.authorStats['Alice'];
        expect(alice).toBeDefined();
        expect(alice!.totalCommits).toBe(15);
        expect(alice!.totalInsertions).toBe(160);
        expect(alice!.totalDeletions).toBe(90);
        expect(alice!.totalFiles).toBe(6);
        expect(alice!.dailyStats['2024-01-01']).toEqual(daily(5, 40, 10, 3));
        expect(alice!.dailyStats['2024-01-02']).toEqual(daily(1, 5, 0, 1));
        expect(alice!.weeklyHourly[1][9]).toBe(2);
    });

    it('widens the author date range and recomputes streaks', () => {
        const r1: ContributionResult = {
            authorStats: {
                Bob: makeAuthor('Bob', {
                    startDate: moment('2024-01-01', 'YYYY-MM-DD'),
                    endDate: moment('2024-01-05', 'YYYY-MM-DD'),
                    dailyStats: { '2024-01-01': daily(1) },
                    currentStreak: 99,
                    longestStreak: 99
                })
            },
            fileStats: [],
            ownership: [],
            wordFreq: {},
            commitDetails: {},
            heatmapDetails: {}
        };
        const r2: ContributionResult = {
            authorStats: {
                Bob: makeAuthor('Bob', {
                    startDate: moment('2024-01-02', 'YYYY-MM-DD'),
                    endDate: moment('2024-01-08', 'YYYY-MM-DD'),
                    dailyStats: { '2024-01-02': daily(1) },
                    currentStreak: 99,
                    longestStreak: 99
                })
            },
            fileStats: [],
            ownership: [],
            wordFreq: {},
            commitDetails: {},
            heatmapDetails: {}
        };

        const merged = mergeResults([r1, r2]);
        const bob = merged.authorStats['Bob'];
        expect(bob!.startDate.format('YYYY-MM-DD')).toBe('2024-01-01');
        expect(bob!.endDate.format('YYYY-MM-DD')).toBe('2024-01-08');
        // Streaks recomputed from sparse merged daily stats, not carried over:
        // 2024-01-01 and 2024-01-02 both have commits, but nothing up to 01-08.
        expect(bob!.currentStreak).toBe(0);
        expect(bob!.longestStreak).toBe(2);
    });

    it('merges file stats by path, sorted by total commits', () => {
        const r1: ContributionResult = {
            authorStats: {},
            fileStats: [
                { file: 'src/a.ts', totalCommits: 3, totalInsertions: 30, totalDeletions: 10 },
                { file: 'src/c.ts', totalCommits: 7, totalInsertions: 70, totalDeletions: 70 }
            ],
            ownership: [],
            wordFreq: {},
            commitDetails: {},
            heatmapDetails: {}
        };
        const r2: ContributionResult = {
            authorStats: {},
            fileStats: [
                { file: 'src/a.ts', totalCommits: 2, totalInsertions: 20, totalDeletions: 5 },
                { file: 'src/b.ts', totalCommits: 1, totalInsertions: 5, totalDeletions: 1 }
            ],
            ownership: [],
            wordFreq: {},
            commitDetails: {},
            heatmapDetails: {}
        };

        const merged = mergeResults([r1, r2]);
        expect(merged.fileStats.map(f => f.file)).toEqual(['src/c.ts', 'src/a.ts', 'src/b.ts']);
        const a = merged.fileStats.find(f => f.file === 'src/a.ts');
        expect(a!.totalCommits).toBe(5);
        expect(a!.totalInsertions).toBe(50);
        expect(a!.totalDeletions).toBe(15);
    });

    it('recomputes ownership primary author and integer percentage', () => {
        const entry1: OwnershipEntry = {
            path: 'src',
            directory: 'src',
            linesByAuthor: { Alice: 100 },
            totalLines: 100,
            primaryAuthor: 'Alice',
            primaryAuthorPercentage: 100
        };
        const entry2: OwnershipEntry = {
            path: 'src',
            directory: 'src',
            linesByAuthor: { Alice: 60, Bob: 40 },
            totalLines: 100,
            primaryAuthor: 'Alice',
            primaryAuthorPercentage: 60
        };

        const merged = mergeResults([
            { authorStats: {}, fileStats: [], ownership: [entry1], wordFreq: {}, commitDetails: {}, heatmapDetails: {} },
            { authorStats: {}, fileStats: [], ownership: [entry2], wordFreq: {}, commitDetails: {}, heatmapDetails: {} }
        ]);

        expect(merged.ownership).toHaveLength(1);
        const src = merged.ownership[0];
        expect(src!.linesByAuthor).toEqual({ Alice: 160, Bob: 40 });
        expect(src!.totalLines).toBe(200);
        expect(src!.primaryAuthor).toBe('Alice');
        expect(src!.primaryAuthorPercentage).toBe(80);
    });

    it('sums word frequency and caps commit details per key', () => {
        const r1: ContributionResult = {
            authorStats: {},
            fileStats: [],
            ownership: [],
            wordFreq: { foo: 2 },
            commitDetails: { '2024-01-01': [{ t: '10:00', a: 'Alice', m: 'one' }] },
            heatmapDetails: {}
        };
        const r2: ContributionResult = {
            authorStats: {},
            fileStats: [],
            ownership: [],
            wordFreq: { foo: 1, bar: 1 },
            commitDetails: { '2024-01-01': [{ t: '11:00', a: 'Bob', m: 'two' }] },
            heatmapDetails: {}
        };

        const merged = mergeResults([r1, r2]);
        expect(merged.wordFreq).toEqual({ foo: 3, bar: 1 });
        expect(merged.commitDetails['2024-01-01']).toEqual([
            { t: '10:00', a: 'Alice', m: 'one' },
            { t: '11:00', a: 'Bob', m: 'two' }
        ]);
        expect(MAX_WORD_FREQ_ENTRIES).toBe(100);
    });
});

describe('computeStreakStats', () => {
    it('computes longest streak across sparse commit days', () => {
        const dailyStats = {
            '2024-01-01': daily(1),
            '2024-01-02': daily(1),
            '2024-01-04': daily(2)
        };
        const { currentStreak, longestStreak } = computeStreakStats(
            dailyStats,
            moment('2024-01-01', 'YYYY-MM-DD'),
            moment('2024-01-04', 'YYYY-MM-DD')
        );
        expect(longestStreak).toBe(2);
        expect(currentStreak).toBe(1);
    });

    it('never counts zero-commit days', () => {
        const dailyStats = {
            '2024-01-01': daily(1),
            '2024-01-02': daily(0),
            '2024-01-03': daily(1)
        };
        const { currentStreak, longestStreak } = computeStreakStats(
            dailyStats,
            moment('2024-01-01', 'YYYY-MM-DD'),
            moment('2024-01-03', 'YYYY-MM-DD')
        );
        expect(longestStreak).toBe(1);
        expect(currentStreak).toBe(1);
    });

    it('handles empty daily stats', () => {
        const { currentStreak, longestStreak } = computeStreakStats(
            {},
            moment('2024-01-01', 'YYYY-MM-DD'),
            moment('2024-01-03', 'YYYY-MM-DD')
        );
        expect(currentStreak).toBe(0);
        expect(longestStreak).toBe(0);
    });
});
