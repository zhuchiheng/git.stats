/**
 * Removes moment subfolders that are never loaded at runtime so the packaged
 * VSIX does not carry ~190 unused locale files. The extension requires moment
 * through its package entry point (the root moment.js); dist/, min/, locale/
 * and ts3.1-test/ are browser/test artifacts that Node require never touches.
 * npm install / npm ci restore the pruned folders.
 */
const fs = require('fs');
const path = require('path');

const momentDir = path.join(__dirname, '..', 'node_modules', 'moment');
for (const sub of ['dist', 'locale', 'min', 'ts3.1-test']) {
    fs.rmSync(path.join(momentDir, sub), { recursive: true, force: true });
}
console.log('prune-moment: removed unused moment subfolders (dist, locale, min, ts3.1-test)');
