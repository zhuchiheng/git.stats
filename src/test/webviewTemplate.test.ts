import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const html = fs.readFileSync(path.resolve(process.cwd(), 'resources', 'visualization.html'), 'utf-8');
const visualizationSource = fs.readFileSync(path.resolve(process.cwd(), 'src', 'visualization.ts'), 'utf-8');

/** Every {{PLACEHOLDER}} the template uses must be substituted by visualization.ts. */
function placeholdersIn(text: string): string[] {
    // regex-literal replacements are written as /\{\{NAME\}\}/g in the source,
    // so drop escapes before matching.
    return [...new Set([...text.replace(/\\/g, '').matchAll(/\{\{([A-Z_]+)\}\}/g)].map(m => m[1]))];
}

describe('visualization webview template', () => {
    it('has no placeholder that visualization.ts fails to replace', () => {
        const substituted = new Set(placeholdersIn(visualizationSource));
        const missing = placeholdersIn(html).filter(name => !substituted.has(name));
        expect(missing).toEqual([]);
    });

    it('replaces date placeholders globally (they appear more than once)', () => {
        for (const name of ['START_DATE', 'END_DATE']) {
            const occurrences = html.split('{{' + name + '}}').length - 1;
            expect(occurrences).toBeGreaterThan(0);
            if (occurrences > 1) {
                // a string-pattern replacement only substitutes the first match
                expect(visualizationSource).toContain('\\{\\{' + name + '\\}\\}/g');
            }
        }
    });

    it('keeps every script tag compatible with its Content-Security-Policy', () => {
        const policy = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i) || [])[1] || '';
        expect(policy, 'webview must declare a CSP').toBeTruthy();

        const directive = (name: string) => {
            const m = policy.match(new RegExp('(?:^|;)\\s*' + name + '\\s+([^;]*)', 'i'));
            return m ? m[1].trim() : '';
        };
        const scriptSrc = directive('script-src') || directive('default-src');
        const scriptTags = [...html.matchAll(/<script\b[^>]*>/gi)].map(m => m[0]);
        expect(scriptTags.length).toBeGreaterThan(0);

        if (scriptSrc.includes("'unsafe-inline'")) {
            return;
        }
        const nonce = (policy.match(/'nonce-([^']+)'/) || [])[1];
        expect(nonce, 'script-src without unsafe-inline must declare a nonce').toBeTruthy();
        expect(nonce).toBe('{{NONCE}}');
        for (const tag of scriptTags) {
            expect(tag, 'script tag must carry the CSP nonce: ' + tag).toContain('nonce="{{NONCE}}"');
        }
        // inline on*="..." handlers are blocked by script-src too
        expect(html).not.toMatch(/<[a-z][^>]*\son(?:click|change|input|load|error|submit)\s*=/i);
    });

    it('allows the inline style attributes the template relies on', () => {
        const policy = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/i) || [])[1] || '';
        expect(policy).toContain("style-src");
        expect(policy).toMatch(/style-src[^;]*'unsafe-inline'/);
    });
});
