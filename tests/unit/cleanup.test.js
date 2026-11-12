/**
 * cleanup.test.js — Unit tests for the AI clean-up use-case.
 *
 * Phase 7 / Improvement plan §12:
 *   "Unit — AI service: Mock fetch; test malformed-response handling (R1),
 *    timeout/abort (R2), retry behavior."
 *
 * These tests inject a mock AIProvider so no real network calls are made.
 */

import { hasMeaningfulContent, cleanNote } from '../../src/usecases/cleanup.js';
import { store } from '../../src/state/store.js';

// ── hasMeaningfulContent (R6) ─────────────────────────────────────────────────

describe('hasMeaningfulContent (R6)', () => {
    test('returns false for an empty string', () => {
        expect(hasMeaningfulContent('')).toBe(false);
    });

    test('returns false for whitespace-only strings', () => {
        expect(hasMeaningfulContent('   ')).toBe(false);
        expect(hasMeaningfulContent('\n\t')).toBe(false);
    });

    test('returns false for the exact placeholder text', () => {
        expect(hasMeaningfulContent('Start typing your notes here...')).toBe(false);
    });

    test('returns true for notes that START with the placeholder but have more content', () => {
        // This was the bug: the old exact-string check rejected these.
        expect(hasMeaningfulContent('Start typing your notes here... and then I added notes')).toBe(true);
    });

    test('returns false for punctuation-only short strings', () => {
        expect(hasMeaningfulContent('...')).toBe(false);
    });

    test('returns true for real content', () => {
        expect(hasMeaningfulContent('Photosynthesis converts sunlight to energy')).toBe(true);
    });
});

// ── cleanNote (R1/R2/R3 guard behaviour) ─────────────────────────────────────

describe('cleanNote', () => {
    // Mock provider that resolves with a fixed response
    const okProvider = {
        setApiKey: () => { },
        complete: async () => '# Clean Notes\n\n## Summary\nA summary.'
    };

    // Mock provider that rejects
    const failProvider = {
        setApiKey: () => { },
        complete: async () => { throw new Error('Network failure'); }
    };

    beforeEach(() => {
        // Ensure store is online for most tests
        store._isOnline = true;
    });

    test('rejects immediately when offline (R3)', async () => {
        store._isOnline = false;
        await expect(cleanNote({
            noteId: 1, rawText: 'Real notes about biology', apiKey: 'key', provider: okProvider
        })).rejects.toThrow(/offline/i);
    });

    test('rejects when content is not meaningful (R6)', async () => {
        await expect(cleanNote({
            noteId: 1, rawText: '', apiKey: 'key', provider: okProvider
        })).rejects.toThrow(/Add some notes/i);
    });

    test('calls provider.setApiKey with the supplied key', async () => {
        const calls = [];
        const trackingProvider = {
            setApiKey: k => calls.push(k),
            complete: async () => '# Title\n\n## Summary\nOk'
        };
        // We need a real noteId to persist — mock saveCleanContent
        // by making the provider throw so we catch before the DB call
        try {
            await cleanNote({
                noteId: 1, rawText: 'Real content here', apiKey: 'my-api-key',
                provider: trackingProvider
            });
        } catch { /* DB not connected in this unit test — that's fine */ }
        expect(calls).toContain('my-api-key');
    });

    test('propagates provider errors (R1)', async () => {
        await expect(cleanNote({
            noteId: 1, rawText: 'Real content here', apiKey: 'key',
            provider: failProvider
        })).rejects.toThrow('Network failure');
    });

    test('propagates AbortError from a cancelled signal (R2)', async () => {
        const controller = new AbortController();
        const abortingProvider = {
            setApiKey: () => { },
            complete: async (_s, _u, { signal }) => {
                controller.abort();
                signal.throwIfAborted();
            }
        };
        await expect(cleanNote({
            noteId: 1, rawText: 'Real content here', apiKey: 'key',
            provider: abortingProvider, signal: controller.signal
        })).rejects.toThrow(/abort/i);
    });
});
