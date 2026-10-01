/**
 * Team risk signals over already-parsed git history:
 *   1. burnout   — how much of an author's work happens at night or on weekends,
 *   2. handover  — directories whose de-facto owner stopped and someone else took over,
 *   3. concentration — directories where one author owns almost everything (bus factor).
 *
 * Deliberately dependency-free (like healthChecks): every input is accepted
 * structurally, so the module is trivially unit-testable and cannot form an
 * import cycle with gitAnalyzer.
 */
import type { Severity } from './healthChecks';

/**
 * All rule thresholds in one place so sensitivity can be tuned together.
 * Shares/ratios are 0..1.
 */
export const SIGNAL_THRESHOLDS = {
    /** Below this many commits an author's working hours are just noise. */
    minCommitsForBurnout: 20,
    /** Off-hours share at or above these levels is medium / high severity. */
    nightShareMedium: 0.15,
    nightShareHigh: 0.3,
    weekendShareMedium: 0.18,
    weekendShareHigh: 0.35,
    /** Payload caps — the panel lists the worst offenders, not everything. */
    maxBurnoutAuthors: 10,
    /** A directory needs this many commits before handover analysis is meaningful. */
    minDirCommitsForHandover: 4,
    /** The incoming author needs at least this many commits in the directory. */
    minCommitsForNewOwner: 2,
    /** Share of the directory held by the previous owner to call it a real handover. */
    handoverOwnerShareHigh: 0.5,
    maxHandoverRows: 10,
    /** Directories smaller than this are not worth flagging for concentration. */
    concentrationMinLines: 200,
    concentrationMediumShare: 0.6,
    concentrationHighShare: 0.8,
    /** Bus factor = authors needed to cover this share of the directory's lines. */
    busFactorTarget: 0.8,
    maxConcentrationRows: 12
} as const;

/** Hours (local commit time) treated as night. */
const NIGHT_HOURS = new Set([22, 23, 0, 1, 2, 3, 4, 5]);
/** `Date#getDay()`/moment `day()` values for Saturday and Sunday. */
const WEEKEND_DAYS = new Set([0, 6]);

export interface BurnoutAuthorRow {
    author: string;
    commits: number;
    nightCommits: number;
    nightShare: number;
    weekendCommits: number;
    weekendShare: number;
    /** Commits at night *or* on a weekend (counted once). */
    offHoursShare: number;
    severity: Severity;
}

export interface HandoverRow {
    directory: string;
    /** Author who used to own the directory. */
    from: string;
    fromLastCommit: string;
    /** Author who took over. */
    to: string;
    toFirstCommit: string;
    fromCommits: number;
    toCommits: number;
    /** Commits in the directory overall (deduplicated per commit). */
    directoryCommits: number;
    severity: Severity;
}

export interface ConcentrationRow {
    directory: string;
    totalLines: number;
    authors: number;
    topAuthor: string;
    topShare: number;
    busFactor: number;
    severity: Severity;
}

export interface TeamSignalsReport {
    burnout: {
        authorsAnalysed: number;
        nightShare: number;
        weekendShare: number;
        offHoursShare: number;
        authors: BurnoutAuthorRow[];
    };
    handover: {
        directoriesAnalysed: number;
        detected: number;
        rows: HandoverRow[];
    };
    concentration: {
        directoriesAnalysed: number;
        singleOwnerDirectories: number;
        highRiskDirectories: number;
        rows: ConcentrationRow[];
    };
    notes: string[];
}

export interface AuthorActivityLike {
    author: string;
    totalCommits?: number;
    /** 7x24 commit matrix, indexed [weekday][hour] (0 = Sunday). */
    weeklyHourly?: number[][];
}

export interface OwnershipLike {
    /** File path — accepted so real OwnershipEntry objects fit structurally. */
    path?: string;
    directory?: string;
    linesByAuthor?: { [author: string]: number };
    totalLines?: number;
}

export interface DirAuthorActivity {
    commits: number;
    firstDate: string;
    lastDate: string;
}

/** Per-directory, per-author activity accumulated while parsing the git log. */
export type DirActivityMap = { [directory: string]: { [author: string]: DirAuthorActivity } };

export interface TeamSignalsInput {
    authorStats?: { [author: string]: AuthorActivityLike };
    ownership?: OwnershipLike[];
    dirActivity?: DirActivityMap;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function share(part: number, total: number): number {
    return total > 0 ? round2(part / total) : 0;
}

interface HourBuckets {
    commits: number;
    night: number;
    weekend: number;
    offHours: number;
}

/**
 * Fold an author's weekday x hour matrix into commit buckets. A commit that is
 * both at night and on a weekend still counts once in `offHours`.
 */
function foldWeeklyHourly(matrix: number[][] | undefined): HourBuckets {
    const buckets: HourBuckets = { commits: 0, night: 0, weekend: 0, offHours: 0 };
    if (!Array.isArray(matrix)) {
        return buckets;
    }
    for (let day = 0; day < matrix.length; day++) {
        const row = matrix[day];
        if (!Array.isArray(row)) {
            continue;
        }
        const weekend = WEEKEND_DAYS.has(day);
        for (let hour = 0; hour < row.length; hour++) {
            const count = row[hour] || 0;
            if (count <= 0) {
                continue;
            }
            const night = NIGHT_HOURS.has(hour);
            buckets.commits += count;
            if (night) {
                buckets.night += count;
            }
            if (weekend) {
                buckets.weekend += count;
            }
            if (night || weekend) {
                buckets.offHours += count;
            }
        }
    }
    return buckets;
}

function burnoutSeverity(nightShare: number, weekendShare: number): Severity {
    const { nightShareHigh, nightShareMedium, weekendShareHigh, weekendShareMedium } = SIGNAL_THRESHOLDS;
    if (nightShare >= nightShareHigh || weekendShare >= weekendShareHigh) {
        return 'high';
    }
    if (nightShare >= nightShareMedium || weekendShare >= weekendShareMedium) {
        return 'medium';
    }
    return 'low';
}

function buildBurnout(authorStats: { [author: string]: AuthorActivityLike } | undefined): TeamSignalsReport['burnout'] {
    const rows: BurnoutAuthorRow[] = [];
    let teamCommits = 0;
    let teamNight = 0;
    let teamWeekend = 0;
    let teamOffHours = 0;
    let authorsAnalysed = 0;

    for (const stats of Object.values(authorStats || {})) {
        if (!stats || !stats.author) {
            continue;
        }
        const buckets = foldWeeklyHourly(stats.weeklyHourly);
        const commits = buckets.commits > 0 ? buckets.commits : (stats.totalCommits || 0);
        teamCommits += commits;
        teamNight += buckets.night;
        teamWeekend += buckets.weekend;
        teamOffHours += buckets.offHours;
        authorsAnalysed++;

        if (commits < SIGNAL_THRESHOLDS.minCommitsForBurnout) {
            continue;
        }
        const nightShare = share(buckets.night, commits);
        const weekendShare = share(buckets.weekend, commits);
        const severity = burnoutSeverity(nightShare, weekendShare);
        if (severity === 'low') {
            continue;
        }
        rows.push({
            author: stats.author,
            commits,
            nightCommits: buckets.night,
            nightShare,
            weekendCommits: buckets.weekend,
            weekendShare,
            offHoursShare: share(buckets.offHours, commits),
            severity
        });
    }

    rows.sort((a, b) =>
        (b.offHoursShare - a.offHoursShare) ||
        (b.nightShare - a.nightShare) ||
        a.author.localeCompare(b.author));

    return {
        authorsAnalysed,
        nightShare: share(teamNight, teamCommits),
        weekendShare: share(teamWeekend, teamCommits),
        offHoursShare: share(teamOffHours, teamCommits),
        authors: rows.slice(0, SIGNAL_THRESHOLDS.maxBurnoutAuthors)
    };
}

/** Author with the most commits in a directory (ties broken by name for determinism). */
function busiest(entries: Array<{ author: string; activity: DirAuthorActivity }>): { author: string; activity: DirAuthorActivity } | undefined {
    let best: { author: string; activity: DirAuthorActivity } | undefined;
    for (const entry of entries) {
        if (!best
            || (entry.activity.commits || 0) > (best.activity.commits || 0)
            || ((entry.activity.commits || 0) === (best.activity.commits || 0) && entry.author < best.author)) {
            best = entry;
        }
    }
    return best;
}

/**
 * A handover is reported when the directory's busiest author has stopped
 * (their last commit there) and a different author started afterwards, i.e. a
 * clean succession rather than two people working side by side.
 */
function buildHandover(dirActivity: DirActivityMap | undefined): TeamSignalsReport['handover'] {
    const rows: HandoverRow[] = [];
    const directories = Object.entries(dirActivity || {});
    let directoriesAnalysed = 0;

    for (const [directory, byAuthor] of directories) {
        const entries = Object.entries(byAuthor || {})
            .map(([author, activity]) => ({ author, activity }))
            .filter(entry => entry.activity && (entry.activity.commits || 0) > 0);
        if (entries.length < 2) {
            continue;
        }
        const directoryCommits = entries.reduce((sum, entry) => sum + (entry.activity.commits || 0), 0);
        if (directoryCommits < SIGNAL_THRESHOLDS.minDirCommitsForHandover) {
            continue;
        }
        directoriesAnalysed++;

        const previous = busiest(entries);
        const incoming = busiest(entries.filter(entry =>
            !!entry.activity.lastDate && (!previous || entry.activity.lastDate > previous.activity.lastDate)));
        if (!previous || !incoming || incoming.author === previous.author) {
            continue;
        }
        if ((incoming.activity.commits || 0) < SIGNAL_THRESHOLDS.minCommitsForNewOwner) {
            continue;
        }
        // Succession requires the new owner to have started after the old owner's
        // last commit in that directory; overlapping work is not a handover.
        if (!previous.activity.lastDate || !incoming.activity.firstDate
            || incoming.activity.firstDate <= previous.activity.lastDate) {
            continue;
        }

        const ownerShare = share(previous.activity.commits || 0, directoryCommits);
        rows.push({
            directory,
            from: previous.author,
            fromLastCommit: previous.activity.lastDate,
            to: incoming.author,
            toFirstCommit: incoming.activity.firstDate,
            fromCommits: previous.activity.commits || 0,
            toCommits: incoming.activity.commits || 0,
            directoryCommits,
            severity: ownerShare >= SIGNAL_THRESHOLDS.handoverOwnerShareHigh ? 'high' : 'medium'
        });
    }

    rows.sort((a, b) =>
        (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1) ||
        (b.directoryCommits - a.directoryCommits) ||
        a.directory.localeCompare(b.directory));

    return {
        directoriesAnalysed,
        detected: rows.length,
        rows: rows.slice(0, SIGNAL_THRESHOLDS.maxHandoverRows)
    };
}

/** Authors needed to reach `busFactorTarget` of the directory's lines. */
function busFactorOf(sortedLines: number[], total: number): number {
    if (total <= 0) {
        return 0;
    }
    const target = total * SIGNAL_THRESHOLDS.busFactorTarget;
    let covered = 0;
    for (let i = 0; i < sortedLines.length; i++) {
        covered += sortedLines[i];
        if (covered >= target) {
            return i + 1;
        }
    }
    return sortedLines.length;
}

function buildConcentration(ownership: OwnershipLike[] | undefined): TeamSignalsReport['concentration'] {
    const byDirectory = new Map<string, { [author: string]: number }>();

    for (const entry of ownership || []) {
        const directory = (entry && entry.directory) || '';
        if (!directory) {
            continue;
        }
        const bucket = byDirectory.get(directory) || {};
        for (const [author, lines] of Object.entries((entry && entry.linesByAuthor) || {})) {
            if (!author) {
                continue;
            }
            bucket[author] = (bucket[author] || 0) + (lines || 0);
        }
        byDirectory.set(directory, bucket);
    }

    const rows: ConcentrationRow[] = [];
    let singleOwnerDirectories = 0;

    for (const [directory, linesByAuthor] of byDirectory) {
        const authors = Object.keys(linesByAuthor);
        const totalLines = Object.values(linesByAuthor).reduce((sum, lines) => sum + lines, 0);
        if (totalLines < SIGNAL_THRESHOLDS.concentrationMinLines) {
            continue;
        }
        const sorted = authors
            .map(author => ({ author, lines: linesByAuthor[author] }))
            .sort((a, b) => b.lines - a.lines || a.author.localeCompare(b.author));
        const topAuthor = sorted.length > 0 ? sorted[0].author : '';
        const topShare = share(sorted.length > 0 ? sorted[0].lines : 0, totalLines);

        if (authors.length === 1) {
            singleOwnerDirectories++;
        }
        const risky = authors.length === 1 || topShare >= SIGNAL_THRESHOLDS.concentrationMediumShare;
        if (!risky) {
            continue;
        }
        rows.push({
            directory,
            totalLines,
            authors: authors.length,
            topAuthor,
            topShare,
            busFactor: busFactorOf(sorted.map(entry => entry.lines), totalLines),
            severity: (authors.length === 1 || topShare >= SIGNAL_THRESHOLDS.concentrationHighShare) ? 'high' : 'medium'
        });
    }

    rows.sort((a, b) =>
        (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1) ||
        (b.totalLines - a.totalLines) ||
        a.directory.localeCompare(b.directory));

    const highRiskDirectories = rows.filter(row => row.severity === 'high').length;
    return {
        directoriesAnalysed: byDirectory.size,
        singleOwnerDirectories,
        highRiskDirectories,
        rows: rows.slice(0, SIGNAL_THRESHOLDS.maxConcentrationRows)
    };
}

/**
 * Build the team-signals report. Every input is optional so results produced
 * before this feature existed (or by tests) degrade to "no data" instead of
 * throwing.
 */
export function buildTeamSignals(input: TeamSignalsInput): TeamSignalsReport {
    const burnout = buildBurnout(input.authorStats);
    const handover = buildHandover(input.dirActivity);
    const concentration = buildConcentration(input.ownership);
    const notes: string[] = [];
    const {
        minCommitsForBurnout,
        nightShareMedium,
        weekendShareMedium,
        concentrationMinLines,
        concentrationMediumShare,
        busFactorTarget
    } = SIGNAL_THRESHOLDS;

    notes.push('夜间按提交自身时区的 22:00–05:59 计，周末按周六周日计；不足 ' +
        minCommitsForBurnout + ' 次提交的作者不参与倦怠排序。');
    notes.push('倦怠阈值为参考值（夜间 ≥ ' + Math.round(nightShareMedium * 100) + '%、周末 ≥ ' +
        Math.round(weekendShareMedium * 100) + '% 进入榜单），是否真的过载需要结合团队节奏判断。');
    if (burnout.authors.length === 0) {
        notes.push('没有作者达到倦怠信号阈值。');
    }
    notes.push('交接信号＝某目录的原主力（提交最多）在该目录停止提交后，另一人开始接手；并行协作不计为交接。');
    if (handover.rows.length === 0) {
        notes.push('没有检测到清晰的目录交接。');
    }
    notes.push('知识集中度按目录聚合代码行归属；单一作者或首要作者占比 ≥ ' +
        Math.round(concentrationMediumShare * 100) + '% 的目录进入风险清单，行数门槛 ' +
        concentrationMinLines + ' 行。');
    notes.push('bus factor = 覆盖该目录 ' + Math.round(busFactorTarget * 100) + '% 代码行所需的作者数。');

    return { burnout, handover, concentration, notes };
}
