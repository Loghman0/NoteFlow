/**
 * safe-markdown.test.js — Unit tests for the XSS-safe Markdown renderer.
 *
 * Phase 7 / Improvement plan §12:
 *   "Unit — sanitize/markdown: Feed the sanitizer known-bad payloads (script
 *    tags, onerror attributes, javascript: URLs) and assert they're stripped;
 *    feed it valid Markdown and assert correct HTML."
 *
 * Runs in jsdom (via jest-environment-jsdom) so we have a real DOM to render
 * into, without needing a browser.
 *
 * @jest-environment jsdom
 */

import { renderMarkdownSafely } from '../../src/util/safe-markdown.js';

// ── helpers ───────────────────────────────────────────────────────────────────

function render(md) {
    const container = document.createElement('div');
    renderMarkdownSafely(md, container);
    return container;
}

// ── XSS / injection payloads (B7 regression) ─────────────────────────────────

describe('XSS / injection defence (B7 regression)', () => {
    test('script tags are NOT inserted as real <script> elements', () => {
        const c = render('## Heading\n\n<script>alert("xss")</script>');
        expect(c.querySelectorAll('script')).toHaveLength(0);
    });

    test('onerror attributes are not present in the rendered DOM', () => {
        const c = render('# Title\n\n<img src=x onerror="alert(1)">');
        expect(c.querySelectorAll('[onerror]')).toHaveLength(0);
        // The dangerous text appears as literal text content, not as an element
        expect(c.textContent).toContain('onerror=');
    });

    test('javascript: URLs are not rendered as real href attributes', () => {
        const c = render('[Click me](javascript:alert(1))');
        expect(c.querySelectorAll('a[href^="javascript"]')).toHaveLength(0);
    });

    test('raw HTML tags in Markdown source appear as literal text, not elements', () => {
        const c = render('Some text <b onclick="evil()">bold</b> here');
        // No real <b> element should be present
        expect(c.querySelectorAll('b')).toHaveLength(0);
        // The text content should appear somewhere (escaped literal)
        expect(c.textContent).toContain('<b onclick');
    });

    test('inline event handlers on any tag are not present', () => {
        const c = render('# Title\n\n<div onmouseover="evil()">Hover me</div>');
        expect(c.querySelectorAll('[onmouseover]')).toHaveLength(0);
    });
});

// ── Valid Markdown → correct DOM structure ────────────────────────────────────

describe('Valid Markdown → correct DOM', () => {
    test('# heading → <h1>', () => {
        const c = render('# My Title');
        expect(c.querySelector('h1')).not.toBeNull();
        expect(c.querySelector('h1').textContent).toBe('My Title');
    });

    test('## heading → <h2>', () => {
        const c = render('## Section');
        expect(c.querySelector('h2')).not.toBeNull();
        expect(c.querySelector('h2').textContent).toBe('Section');
    });

    test('### heading → <h3>', () => {
        const c = render('### Sub');
        expect(c.querySelector('h3')).not.toBeNull();
    });

    test('- list items → <ul><li> elements', () => {
        const c = render('- Alpha\n- Beta\n- Gamma');
        const ul = c.querySelector('ul');
        expect(ul).not.toBeNull();
        const items = ul.querySelectorAll('li');
        expect(items).toHaveLength(3);
        expect(items[0].textContent).toContain('Alpha');
        expect(items[1].textContent).toContain('Beta');
    });

    test('**bold** text → <strong> element', () => {
        const c = render('This is **important** text.');
        expect(c.querySelector('strong')).not.toBeNull();
        expect(c.querySelector('strong').textContent).toBe('important');
    });

    test('plain paragraph text → <p> or text node', () => {
        const c = render('Just a plain sentence.');
        expect(c.textContent).toContain('Just a plain sentence.');
    });

    test('full clean-note format (heading + summary + key terms + notes)', () => {
        const md = `# Photosynthesis

## Summary
Plants convert light to energy.

## Key Terms
- **Chlorophyll**: green pigment
- **ATP**: energy currency

## Structured Notes
### Light Reactions
- Occur in the thylakoid
`;
        const c = render(md);
        expect(c.querySelector('h1').textContent).toBe('Photosynthesis');
        expect(c.querySelector('h2').textContent).toBe('Summary');
        expect(c.querySelectorAll('strong').length).toBeGreaterThanOrEqual(2);
        expect(c.querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
    });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('Edge cases', () => {
    test('empty string does not throw', () => {
        expect(() => render('')).not.toThrow();
    });

    test('null/undefined does not throw', () => {
        expect(() => render(null)).not.toThrow();
        expect(() => render(undefined)).not.toThrow();
    });

    test('clears previous content before rendering', () => {
        const container = document.createElement('div');
        renderMarkdownSafely('# First', container);
        renderMarkdownSafely('# Second', container);
        const headings = container.querySelectorAll('h1');
        expect(headings).toHaveLength(1);
        expect(headings[0].textContent).toBe('Second');
    });
});
