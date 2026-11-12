/**
 * perplexity.js — Concrete AI provider adapter for Perplexity (Phase 8, A2).
 *
 * This is the only file that knows about Perplexity's URL, model name, and
 * response shape. To add a second provider (e.g. OpenAI), create a sibling
 * file here and update the export in src/main.js — no business-logic files
 * need to change.
 *
 * Retries, timeout, and AbortController live here (provider-level concerns),
 * not in the use-case layer.
 */

import { AIProvider } from '../provider.js';

const API_URL = 'https://api.perplexity.ai/chat/completions';
const MODEL = 'llama-3.1-sonar-small-128k-online';
const TIMEOUT_MS = 40_000;
const MAX_RETRIES = 1;   // one automatic retry on transient network errors
const RETRY_DELAY_MS = 1500;

export class PerplexityProvider extends AIProvider {
    constructor() {
        super();
        this._apiKey = null;
    }

    setApiKey(key) {
        this._apiKey = key;
    }

    /**
     * @param {string} systemPrompt
     * @param {string} userPrompt
     * @param {{ signal?: AbortSignal }} [opts]
     * @returns {Promise<string>}
     */
    async complete(systemPrompt, userPrompt, opts = {}) {
        return this._attempt(systemPrompt, userPrompt, opts, 0);
    }

    async _attempt(systemPrompt, userPrompt, opts, attempt) {
        // Each attempt gets its own AbortController so that an internal timeout
        // doesn't cancel the caller's external signal on retries.
        const localController = new AbortController();
        const timeoutId = setTimeout(() => localController.abort(), TIMEOUT_MS);

        // Combine the caller's signal (if any) with our local timeout signal.
        const signal = opts.signal
            ? _anySignal([opts.signal, localController.signal])
            : localController.signal;

        let response;
        try {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this._apiKey}`
                },
                body: JSON.stringify({
                    model: MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 2000
                }),
                signal
            });
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                // Distinguish a caller-initiated abort from our internal timeout.
                if (opts.signal?.aborted) throw err; // pass through to caller
                throw new Error('The AI request timed out. Please try again.');
            }
            // Transient network failure — retry once.
            if (attempt < MAX_RETRIES) {
                await _delay(RETRY_DELAY_MS);
                return this._attempt(systemPrompt, userPrompt, opts, attempt + 1);
            }
            throw new Error('Could not reach the AI service. Check your connection and try again.');
        } finally {
            clearTimeout(timeoutId);
        }

        if (!response.ok) {
            let detail = '';
            try {
                const body = await response.json();
                detail = body?.error?.message ? `: ${body.error.message}` : '';
            } catch { /* response wasn't JSON */ }

            // 5xx errors are potentially transient — retry once.
            if (response.status >= 500 && attempt < MAX_RETRIES) {
                await _delay(RETRY_DELAY_MS);
                return this._attempt(systemPrompt, userPrompt, opts, attempt + 1);
            }

            throw new Error(`AI API error (${response.status})${detail}`);
        }

        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error('The AI service returned an unreadable response.');
        }

        const content = data?.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || content.trim() === '') {
            throw new Error('The AI service returned an empty or unexpected response.');
        }

        return content.trim();
    }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns an AbortSignal that aborts when *any* of the given signals aborts.
 * Polyfill for AbortSignal.any() which isn't universally available yet.
 * @param {AbortSignal[]} signals
 * @returns {AbortSignal}
 */
function _anySignal(signals) {
    const controller = new AbortController();
    for (const sig of signals) {
        if (sig.aborted) { controller.abort(sig.reason); return controller.signal; }
        sig.addEventListener('abort', () => controller.abort(sig.reason), { once: true });
    }
    return controller.signal;
}
