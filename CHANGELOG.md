# Change Log

All notable changes to the "Git Stats Visualizer" extension will be documented in this file.

## [1.3.1] - 2026-10-01

### Security
- **Webview hardening**: Content Security Policy with a per-panel nonce; all inline event handlers removed and replaced by data attributes plus listeners inside the nonce'd script
- HTML and JSON escaping helpers (`escapeHtml`/`toSafeJson`) applied to values injected into the webview
- Sanitized error messages surfaced through notifications and the webview

### Changed
- Extracted cross-repo merging into a dedicated `src/mergeStats.ts` module covered by unit tests
- Generated-file detection is now pure path matching — no filesystem IO in the analysis hot loop
- Eliminated the double `git log` analysis that ran when merging multiple repositories
- Git log parsing hardened: `%x00` block delimiter, author email (`%ae`), ISO-8601 `--since`/`--until` filters, stash/WIP and malformed-record skipping
- Repository discovery uses a skip-list and depth limit
- Unified error handling for analysis, export and webview messaging
- `package-lock.json` is now tracked; build artifacts (`dist/`, `out/`, `vsix-package/`) are no longer committed
- Unused Moment locale files are pruned from the VSIX package
- CI workflow runs typecheck, ESLint and the unit test suite before packaging
- Pruned unused devDependencies and migrated to ESLint 9 flat config; added a vitest test suite

### Fixed
- Streak stats are recomputed after cross-repo merge instead of being carried over
- `package.json` license field aligned with the Apache-2.0 LICENSE file
- README / README_CN feature list and support links synced with actual behavior

## [1.0.0] - 2026-06-01

### Added
- **7 New Visualization Features:**
  - Hourly commits/lines distribution charts (line/bar)
  - Monthly contribution calendar with color intensity
  - File change leaderboard (top 100 files by commits)
  - Commit message word frequency analysis (with Chinese tokenization support)
  - Author activity heatmap (day × hour grid)
  - Code ownership by directory and by file (primary author + ownership %)
  - Commit streaks tracking (current & longest streak per author)
- **Auto Range & Custom Date Picker** — automatically selects the optimal range, with manual date override support
- **Multi-repo Workspace Support** — dropdown selector to switch between repos, cross-repo stats merging
- **Developer Filter** — filter all charts/tables by a single author
- **CSV Export** — export summary and file stats tables to CSV
- **PNG Export** — export any chart as PNG image
- Draggable floating pie charts for commit & lines-changed distribution
- Streak badges with color-coded indicators (hot/warm/cold)
- "Last 3 Years" time range option

### Changed
- Complete rewrite of visualization layer (moved from D3 to Chart.js v4)
- Upgraded backend data model with `ContributionResult`, `FileChangeStats`, `OwnershipEntry` types
- Default time range changed from 7 days to auto range (full history)
- Bundle chart.js locally instead of loading from CDN

### Fixed
- More informative error message when no Git repositories are found
- Removed unreachable lines in git log parsing for large repos

### Removed
- Terser minification (redundant with webpack production mode)
- D3 visualization bundle (replaced by Chart.js + plain HTML/CSS)

## [0.1.0] - 2023-11-14

### Added
- Initial release
- Interactive pie charts for commit and lines changed distribution
- Draggable chart containers
- Time range selector (Last Week to Last Year)
- Real-time data updates
- Detailed tooltips with percentage and counts
- Modern UI with smooth animations
- Memory-efficient data handling
