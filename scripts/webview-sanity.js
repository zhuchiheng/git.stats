/**
 * Webview sanity harness for resources/visualization.html.
 *
 * The visualization webview is a single large inline <script> that runs inside
 * a VS Code webview under a strict Content-Security-Policy. Three classes of
 * defect there are invisible to tsc/eslint/vitest yet blank the panel (or part
 * of it):
 *
 *   1. a load-time ReferenceError in the inline script — everything after it is
 *      never defined (see the `endDate is not defined` regression in 1.3.1);
 *   2. a CSP violation (inline script without the policy nonce, or an inline
 *      on*="..." handler while script-src forbids unsafe-inline) which blocks
 *      the script outright;
 *   3. touching a DOM element that is declared *after* the script tag while the
 *      parser is still running — getElementById returns null and the load-time
 *      TypeError kills every initial render below that line (see the
 *      `#commitTooltip` regression: charts drawn, calendar and all following
 *      tables blank).
 *
 * WARNING: order matters. The whole point of check 3 is that the tooltip-case
 * regression looked exactly like an empty-data problem.
 *
 * This harness replays the extension's placeholder replacement, then (a) checks
 * the CSP/nonce invariants a browser enforces, and (b) actually EXECUTES every
 * inline script against an id-aware DOM stub that mirrors parser timing:
 * getElementById only resolves ids declared before the script, and a synthetic
 * DOMContentLoaded is dispatched afterwards.
 *
 * Run: npm run sanity:webview
 */
const fs = require('fs');
const path = require('path');

const htmlPath = process.argv[2] || path.join(__dirname, '..', 'resources', 'visualization.html');
let html = fs.readFileSync(htmlPath, 'utf-8');

// --- replay the extension's replacement contract -------------------------
// Shapes mirror what visualization.ts actually emits; keep in sync with the
// `replacements` array in src/visualization.ts.
const commitData = { labels: ['2026-09-25'], datasets: [{ label: 'alice', data: [3], borderColor: '#f00', backgroundColor: '#f00', fill: false, tension: 0.4, cubicInterpolationMode: 'monotone' }] };
const calendarData = [{ date: '2026-09-25', totalCommits: 3, colorIntensity: 0.5 }];
const authorRows = '<tr><td>alice</td><td>3</td><td>1</td><td>1</td><td>1</td><td>1 day</td><td>1 day</td></tr>';

const replacements = [
    [/\{\{NONCE\}\}/g, 'deadbeefdeadbeefdeadbeefdeadbeef'],
    [/\{\{CSP_SOURCE\}\}/g, 'https://*.vscode-cdn.net'],
    ['{{CHART_JS_URI}}', 'https://test-cdn/chart.umd.js'],
    ['{{REPO_OPTIONS}}', '<option value="all">All repositories</option><option value="0">repo</option>'],
    ['{{BRANCH_OPTIONS}}', '<option value="--all" selected>All branches</option>'],
    ['{{AUTHOR_OPTIONS}}', '<option value="all">All developers</option>'],
    ['{{COMMIT_DATA}}', JSON.stringify(commitData)],
    ['{{CHANGE_DATA}}', JSON.stringify(commitData)],
    ['{{HOURLY_COMMIT_DATA}}', JSON.stringify(commitData)],
    ['{{HOURLY_CHANGE_DATA}}', JSON.stringify(commitData)],
    [/\{\{START_DATE\}\}/g, '2026-09-25'],
    [/\{\{END_DATE\}\}/g, '2026-10-01'],
    ['{{AUTHOR_ROWS}}', authorRows],
    ['{{CALENDAR_DATA}}', JSON.stringify(calendarData)],
    ['{{FILE_STATS}}', JSON.stringify([{ file: 'src/a.ts', totalCommits: 2, totalInsertions: 1, totalDeletions: 0, totalLines: 10 }])],
    ['{{OWNERSHIP}}', JSON.stringify([{ path: 'src/a.ts', totalLines: 10, primaryAuthor: 'alice', primaryAuthorPercentage: 100, linesByAuthor: { alice: 10 } }])],
    ['{{WEEKLY_HOURLY_GRID}}', JSON.stringify(Array.from({ length: 7 }, () => new Array(24).fill(0)))],
    ['{{WEEKLY_HOURLY_MAX}}', '1'],
    ['{{WORD_FREQ}}', JSON.stringify({ fix: 3 })],
    ['{{IS_AUTO}}', 'true'],
    ['{{COMMIT_DETAILS}}', JSON.stringify({ alice: [] })],
    ['{{HEATMAP_DETAILS}}', JSON.stringify({ '2026-09-25': [] })]
];
for (const [pattern, value] of replacements) {
    html = html.replace(pattern, () => value);
}

const failures = [];
const leftover = html.match(/\{\{[A-Z_]+\}\}/g);
if (leftover) failures.push('unreplaced placeholders: ' + [...new Set(leftover)].join(', '));

// --- CSP invariants (browser-enforced, invisible to node execution) -------
const cspMatch = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i);
if (cspMatch) {
    const policy = cspMatch[1];
    const directive = name => {
        const m = policy.match(new RegExp('(?:^|;)\\s*' + name + '\\s+([^;]*)', 'i'));
        return m ? m[1].trim() : '';
    };
    const scriptSrc = directive('script-src') || directive('default-src');
    const styleSrc = directive('style-src') || directive('default-src');
    const nonce = (policy.match(/'nonce-([^']+)'/) || [])[1] || null;
    const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);

    if (scriptSrc.includes("'unsafe-inline'")) {
        console.log('CSP: script-src allows unsafe-inline (' + scriptTags.length + ' script tag(s))');
    } else if (!nonce) {
        failures.push('CSP: script-src has neither unsafe-inline nor a nonce — every script would be blocked');
    } else {
        for (const tag of scriptTags) {
            const tagNonce = (tag.match(/nonce="([^"]*)"/) || [])[1];
            if (tagNonce !== nonce) failures.push('CSP: script tag blocked by policy (missing/mismatched nonce): ' + tag);
        }
        const handlers = [...html.matchAll(/<[a-z][^>]*\s(on(?:click|change|input|load|error|submit|mouseover|touchstart))\s*=/gi)].map(m => m[1]);
        if (handlers.length) failures.push('CSP: inline event handler attributes blocked: ' + [...new Set(handlers)].join(', '));
        console.log('CSP: ' + scriptTags.length + ' script tag(s) verified against nonce policy');
    }

    if (!styleSrc.includes("'unsafe-inline'") && /style="[^"]+"/.test(html)) {
        failures.push('CSP: inline style attributes present but style-src lacks unsafe-inline');
    }
} else {
    console.log('CSP: no CSP meta tag found');
}

// --- parser-timing model: which ids are reachable from the inline script? --
const inlineScriptIndex = html.search(/<script(?![^>]*src=)/i);
if (inlineScriptIndex < 0) failures.push('no inline script found in the template');

const idsBeforeScript = new Set();
const allIds = new Set();
for (const m of html.matchAll(/\bid="([^"]+)"/g)) {
    allIds.add(m[1]);
    if (m.index < inlineScriptIndex) idsBeforeScript.add(m[1]);
}
let availableIds = new Set(idsBeforeScript);
const requestedIds = new Set();
const unknownIds = new Set();
const nullHits = new Set();
const domContentLoadedHandlers = [];

// --- execute the inline scripts with DOM stubs ---------------------------
const scripts = inlineScriptIndex < 0 ? [] : [...html.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

const listeners = [];
function makeEl(id) {
    return {
        id, value: '', innerHTML: '', textContent: '', checked: false, disabled: false,
        dataset: {}, style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        addEventListener(type) { listeners.push([id || '<anon>', type]); },
        removeEventListener() {},
        appendChild() {}, removeChild() {}, insertAdjacentHTML() {}, focus() {}, click() {},
        contains() { return false; },
        querySelector() { return makeEl(id + '/q'); },
        querySelectorAll() { return []; },
        closest() { return makeEl(id + '/parent'); },
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; },
        setAttribute() {}, getAttribute() { return null; },
        offsetWidth: 100, offsetHeight: 100, offsetLeft: 0, offsetTop: 0
    };
}
const canvasCtx = {
    canvas: { toDataURL() { return 'data:image/png;base64,'; } },
    save() {}, restore() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
    fillRect() {}, clearRect() {}, drawImage() {}, measureText() { return { width: 10 }; },
    fillText() {}, arc() {}, fill() {}, translate() {}, scale() {},
    set fillStyle(v) {}, get fillStyle() { return ''; },
    set font(v) {}, get font() { return ''; }
};
const documentStub = {
    readyState: 'loading',
    getElementById(id) {
        requestedIds.add(id);
        if (!allIds.has(id)) unknownIds.add(id);
        if (!availableIds.has(id)) {
            nullHits.add(id);
            return null;
        }
        return makeEl(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return makeEl('doc/q'); },
    addEventListener(type, fn) {
        listeners.push(['document', type]);
        if (type === 'DOMContentLoaded' && typeof fn === 'function') domContentLoadedHandlers.push(fn);
    },
    createElement(tag) { const e = makeEl(tag); e.getContext = () => canvasCtx; e.toDataURL = () => 'data:'; e.width = 300; e.height = 150; return e; },
    createTextNode(t) { return { textContent: t }; },
    body: makeEl('body'),
    documentElement: makeEl('html')
};
const navigatorStub = { clipboard: { writeText() { return Promise.resolve(); } } };
const windowStub = {
    addEventListener(type) { listeners.push(['window', type]); },
    removeEventListener() {},
    location: { href: '' },
    navigator: navigatorStub,
    requestAnimationFrame: fn => fn(),
    open() {}, getSelection() { return { removeAllRanges() {} }; }
};
let chartCount = 0;
class ChartStub {
    constructor() {
        chartCount++;
        this.destroy = () => {}; this.resize = () => {}; this.update = () => {};
        this.options = { plugins: {}, interaction: {} };
        this.data = { labels: [], datasets: [] };
        this.config = {};
    }
}
ChartStub.getChart = () => null;
ChartStub.register = () => {};
let posted = [];
function acquireVsCodeApi() {
    return { postMessage(m) { posted.push(m); }, getState() { return {}; }, setState() {} };
}

scripts.forEach((code, i) => {
    try {
        const fn = new Function(
            'document', 'window', 'Chart', 'acquireVsCodeApi', 'navigator', 'location',
            'requestAnimationFrame', 'alert', 'confirm', 'Blob', 'URL',
            code
        );
        fn(documentStub, windowStub, ChartStub, acquireVsCodeApi, navigatorStub, windowStub.location,
            windowStub.requestAnimationFrame, () => {}, () => true,
            function (parts) { return { size: 0, type: '' }; },
            { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} });
        console.log('inline script[' + i + ']: load-time execution clean');
    } catch (e) {
        failures.push('inline script[' + i + '] threw during load: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    }
});

// the parser finishes the document, then DOMContentLoaded fires
availableIds = new Set(allIds);
documentStub.readyState = 'complete';
for (const handler of domContentLoadedHandlers) {
    try {
        handler();
    } catch (e) {
        failures.push('DOMContentLoaded handler threw: ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    }
}
console.log('DOMContentLoaded handlers run: ' + domContentLoadedHandlers.length);

if (unknownIds.size) {
    failures.push('getElementById target(s) never exist in the template: ' + [...unknownIds].join(', '));
}
if (nullHits.size) {
    console.log('elements referenced before they are parsed (must be null-guarded/deferred): ' + [...nullHits].join(', '));
}

const boundIds = new Set(listeners.map(l => l[0] + ':' + l[1]));
for (const required of ['commitTooltip:click', 'commitTooltip:touchstart']) {
    if (!boundIds.has(required)) {
        failures.push('after DOMContentLoaded the tooltip listener ' + required + ' is still not bound (feature silently dead)');
    }
}
if (scripts.length && !listeners.some(l => l[0] === 'window' && l[1] === 'message')) {
    failures.push('the inline script never registered its window "message" listener, so live updates cannot arrive');
}
console.log('charts constructed at load: ' + chartCount);

if (failures.length) {
    console.error('\nFAIL (' + failures.length + '):');
    for (const f of failures) console.error('  - ' + f);
    process.exit(1);
}
console.log('\nPASS: webview template is CSP-consistent and its inline script runs cleanly with parser-faithful DOM timing');
