/**
 * provider.js — AI provider interface (Phase 8, A2).
 *
 * The improvement plan calls out that ai-service.js hard-codes one vendor's
 * URL, model name, and response shape directly inside business logic (A2),
 * making it impossible to swap or A/B test providers without touching the
 * use-case layer. This file defines the contract every provider must satisfy;
 * concrete implementations live in src/ai/providers/.
 *
 * Swapping providers now only requires updating the export from
 * src/main.js (or a future config module) — no business-logic files change.
 */

/**
 * Abstract base class for AI providers.
 *
 * Every provider must implement `complete(systemPrompt, userPrompt, opts)`
 * and `setApiKey(key)`. All other provider-specific details (URL, model name,
 * request/response shape, retry behaviour) stay inside the concrete adapter.
 */
export class AIProvider {
    /**
     * Set (or update) the API key for this provider.
     * Called once per session before the first `complete()` call.
     * @param {string} key
     */
    // eslint-disable-next-line no-unused-vars
    setApiKey(key) {
        throw new Error('AIProvider.setApiKey() must be implemented by a subclass');
    }

    /**
     * Send a completion request to the AI provider.
     *
     * @param {string} systemPrompt  — Instructions for the model (role, format, constraints).
     * @param {string} userPrompt    — The user's content to process.
     * @param {object} [opts]
     * @param {AbortSignal} [opts.signal] — Optional AbortSignal for cancellation / timeout.
     * @returns {Promise<string>} The model's text response, trimmed.
     */
    // eslint-disable-next-line no-unused-vars
    async complete(systemPrompt, userPrompt, opts = {}) {
        throw new Error('AIProvider.complete() must be implemented by a subclass');
    }
}
