import { describe, it, expect } from 'vitest';
import { SIGNAL_THRESHOLDS, TeamSignalsInput, buildTeamSignals } from '../teamSignals';
import { mergeResults } from '../mergeStats';
import type { ContributionResult } from '../gitAnalyzer';

/** Build a 7x24 commit matrix from [weekday, hour, count] triples. */
function matrix(entries: Array<[number, number, number]>): number[][] {
    const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const [day, hour, count] of entries) {
        grid[day][hour] += count;
    }
    return grid;
}

function burnoutInput(): TeamSignalsInput {
    return {
        authorStats: {
            Alice: { author: 'Alice', totalCommits: 20, weeklyHourly: matrix([[2, 22, 6], [3, 10, 14]]) },
            Bob: { author: 'Bob', totalCommits: 20, weeklyHourly: matrix([[4, 3, 3], [4, 12, 17]]) },
            // Below the scoring threshold, but still part of the team totals.
            Carol: { author: 'Carol', totalCommits: 10, weeklyHourly: matrix([[1, 23, 10]]) },
            Dave: { author: 'Dave', totalCommits: 25, weeklyHourly: matrix([[0, 14, 10], [5, 14, 15]]) },
            // No matrix at all: cannot be judged, must not throw.
            Erin: { author: 'Erin', totalCommits: 50 }
        }
    };
}

describe('buildTeamSignals — burnout', () => {
    const report = buildTeamSignals(burnoutInput()).burnout;

    it('flags night-heavy authors and skips under-sampled ones', () => {
        expect(report.authors.map(row => row.author)).toEqual(['Dave', 'Alice', 'Bob']);
        expect(report.authorsAnalysed).toBe(5);
    });

    it('computes shares per author and grades severity', () => {
        const alice = report.authors.find(row => row.author === 'Alice')!;
        expect(alice).toMatchObject({
            commits: 20,
            nightCommits: 6,
            nightShare: 0.3,
            weekendShare: 0,
            severity: 'high'
        });
        const bob = report.authors.find(row => row.author === 'Bob')!;
        expect(bob.nightShare).toBe(0.15);
        expect(bob.severity).toBe('medium');
        const dave = report.authors.find(row => row.author === 'Dave')!;
        expect(dave.weekendShare).toBe(0.4);
        expect(dave.severity).toBe('high');
    });

    it('aggregates team shares over every analysed author', () => {
        // 19 night commits of 125; 10 weekend (Sunday) commits; no overlap here.
        expect(report.nightShare).toBe(0.15);
        expect(report.weekendShare).toBe(0.08);
        expect(report.offHoursShare).toBe(0.23);
    });

    it('counts a night-on-weekend commit once in the off-hours share', () => {
        const solo = buildTeamSignals({
            authorStats: {
                NightOwl: { author: 'NightOwl', totalCommits: 20, weeklyHourly: matrix([[0, 23, 20]]) }
            }
        }).burnout;
        expect(solo.nightShare).toBe(1);
        expect(solo.weekendShare).toBe(1);
        expect(solo.offHoursShare).toBe(1);
        expect(solo.authors[0].nightCommits).toBe(20);
    });

    it('falls back to totalCommits when the hourly matrix is missing', () => {
        const erin = buildTeamSignals(burnoutInput()).burnout.authors.find(row => row.author === 'Erin');
        expect(erin).toBeUndefined(); // no matrix → no shares → not a finding
    });
});

describe('buildTeamSignals — handover', () => {
    const report = buildTeamSignals({
        dirActivity: {
            'src/legacy': {
                old: { commits: 6, firstDate: '2024-01-01', lastDate: '2024-02-01' },
                fresh: { commits: 3, firstDate: '2024-03-01', lastDate: '2024-04-01' }
            },
            // Two authors active at the same time — parallel work, not a handover.
            'src/together': {
                a: { commits: 5, firstDate: '2024-01-01', lastDate: '2024-05-01' },
                b: { commits: 4, firstDate: '2024-02-01', lastDate: '2024-04-01' }
            },
            // Clean succession but the newcomer barely committed.
            'src/thin': {
                old: { commits: 6, firstDate: '2024-01-01', lastDate: '2024-02-01' },
                new: { commits: 1, firstDate: '2024-03-01', lastDate: '2024-03-02' }
            },
            // Too little history to judge.
            'src/tiny': {
                x: { commits: 2, firstDate: '2024-01-01', lastDate: '2024-01-05' },
                y: { commits: 1, firstDate: '2024-02-01', lastDate: '2024-02-02' }
            },
            'src/solo': { solo: { commits: 9, firstDate: '2024-01-01', lastDate: '2024-01-09' } }
        }
    }).handover;

    it('reports a clean succession with its switch date', () => {
        expect(report.detected).toBe(1);
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0]).toMatchObject({
            directory: 'src/legacy',
            from: 'old',
            fromLastCommit: '2024-02-01',
            to: 'fresh',
            toFirstCommit: '2024-03-01',
            fromCommits: 6,
            toCommits: 3,
            directoryCommits: 9,
            severity: 'high'
        });
    });

    it('only analyses directories with enough history and two authors', () => {
        // legacy + together + thin qualify; tiny (3 commits) and solo (one author) do not.
        expect(report.directoriesAnalysed).toBe(3);
    });

    it('ignores overlapping work and thin newcomers', () => {
        expect(report.rows.map(row => row.directory)).not.toContain('src/together');
        expect(report.rows.map(row => row.directory)).not.toContain('src/thin');
    });
});

describe('buildTeamSignals — knowledge concentration', () => {
    const report = buildTeamSignals({
        ownership: [
            { path: 'src/a.ts', directory: 'src/core', linesByAuthor: { alice: 2400 }, totalLines: 2400 },
            { path: 'src/b.ts', directory: 'src/mixed', linesByAuthor: { alice: 700 }, totalLines: 700 },
            { path: 'src/c.ts', directory: 'src/mixed', linesByAuthor: { bob: 300 }, totalLines: 300 },
            { path: 'src/d.ts', directory: 'src/small', linesByAuthor: { alice: 100 }, totalLines: 100 },
            { path: 'src/e.ts', directory: 'src/wide', linesByAuthor: { alice: 500, bob: 300, carol: 200 }, totalLines: 1000 },
            { path: 'src/f.ts', directory: 'src/deep', linesByAuthor: { alice: 620, bob: 130, carol: 130, dave: 120 }, totalLines: 1000 }
        ]
    }).concentration;

    it('aggregates file ownership per directory', () => {
        const mixed = report.rows.find(row => row.directory === 'src/mixed')!;
        expect(mixed).toMatchObject({ totalLines: 1000, authors: 2, topAuthor: 'alice', topShare: 0.7, severity: 'medium' });
    });

    it('marks single-owner directories as high risk', () => {
        const core = report.rows.find(row => row.directory === 'src/core')!;
        expect(core).toMatchObject({ authors: 1, topShare: 1, busFactor: 1, severity: 'high' });
        expect(report.singleOwnerDirectories).toBe(1);
        expect(report.highRiskDirectories).toBe(1);
    });

    it('computes the bus factor as authors needed to cover 80% of the lines', () => {
        const mixed = report.rows.find(row => row.directory === 'src/mixed')!;
        expect(mixed.busFactor).toBe(2);
        const deep = report.rows.find(row => row.directory === 'src/deep')!;
        // 620 < 800, 620+130 < 800, 620+130+130 >= 800 → three authors.
        expect(deep.busFactor).toBe(3);
    });

    it('ignores small directories and evenly spread ownership', () => {
        const directories = report.rows.map(row => row.directory);
        expect(directories).not.toContain('src/small');
        expect(directories).not.toContain('src/wide'); // top share 0.5 < medium threshold
        expect(report.directoriesAnalysed).toBe(5);
    });

    it('keeps the whole report usable when nothing is passed in', () => {
        const empty = buildTeamSignals({});
        expect(empty.burnout.authors).toEqual([]);
        expect(empty.handover.detected).toBe(0);
        expect(empty.concentration.rows).toEqual([]);
        expect(empty.notes.length).toBeGreaterThan(0);
    });

    it('exposes the thresholds it promises to document', () => {
        expect(SIGNAL_THRESHOLDS.busFactorTarget).toBe(0.8);
        expect(SIGNAL_THRESHOLDS.minCommitsForBurnout).toBe(20);
    });
});

describe('mergeResults — directory activity', () => {
    const empty = (): ContributionResult => ({
        authorStats: {},
        fileStats: [],
        ownership: [],
        wordFreq: {},
        commitDetails: {},
        heatmapDetails: {}
    });

    it('sums commits and widens first/last dates across repos', () => {
        const first: ContributionResult = {
            ...empty(),
            dirActivity: { src: { alice: { commits: 2, firstDate: '2024-01-01', lastDate: '2024-01-05' } } }
        };
        const second: ContributionResult = {
            ...empty(),
            dirActivity: {
                src: {
                    alice: { commits: 3, firstDate: '2023-12-01', lastDate: '2024-02-01' },
                    bob: { commits: 1, firstDate: '2024-03-01', lastDate: '2024-03-01' }
                }
            }
        };

        const merged = mergeResults([first, second]);
        expect(merged.dirActivity!['src']['alice']).toEqual({
            commits: 5,
            firstDate: '2023-12-01',
            lastDate: '2024-02-01'
        });
        expect(merged.dirActivity!['src']['bob']!.commits).toBe(1);
    });

    it('tolerates results produced before the feature existed', () => {
        const merged = mergeResults([empty(), empty()]);
        expect(merged.dirActivity).toEqual({});
    });
});
