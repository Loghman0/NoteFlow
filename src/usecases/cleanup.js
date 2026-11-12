/**
 * cleanup.js — AI "Clean this up" use-case (Phase 3 + Phase 8).
 *
 * All AI-clean-up business logic: guards (online check, content check),
 * the AI call itself, and persisting the result. Nothing here touches the
 * DOM — the view is responsible for showing progress and surfacing errors.
 *
 * The system prompt lives here (it belongs to the use-case layer, not the
 * AI transport layer); the transport is provided by the injected AIProvider
 * instance, which can be swapped or mocked in tests without touching this
 * file (Phase 8, A2).
 */

import { store } from '../state/store.js';
import { saveCleanContent } from './notes.js';

// ── System prompt ────────────────────────────────────────────────────────────
// Kept as-is from the original (audited as "genuinely well-designed" in the
// improvement plan). One line added (item 6) to reduce reliance on DOM
// sanitization as the only injection defense.

const SYSTEM_PROMPT = `You are helping a student turn their raw, in-the-moment lesson notes into
clean, study-ready notes. You will be given raw notes exactly as the
student typed them during class — expect fragments, abbreviations,
inconsistent formatting, and possible typos.

Your job:
1. Detect the language the notes are written in. Respond in that same language.
2. Reorganize the content into a clear structure (headings for topics,
   bullet points for details) WITHOUT inventing information that
   wasn't in the original notes.
3. Identify and mark the 5-10 most important terms or concepts as key terms.
4. Write a 2-4 sentence summary of what the lesson covered, based only
   on what's in the notes.
5. Preserve the student's own phrasing and wording wherever possible —
   do not rewrite everything in a generic voice. These are their notes,
   not a textbook.
6. If the notes are too sparse or unclear to structure meaningfully,
   say so plainly rather than fabricating structure or content.

Only use plain Markdown: "#"/"##"/"###" headings, "**bold**", and "- " bullet
lists. Do not output raw HTML, script tags, or links.

Never add facts, dates, or claims that are not present in the original
notes. If something is ambiguous, preserve the ambiguity rather than
guessing.

Output format (use markdown):
# [Title based on content]

## Summary
[2-4 sentence summary]

## Key Terms
- **term1**: brief explanation
- **term2**: brief explanation
- ...

## Structured Notes
[Well-organized notes with headings and bullet points, preserving original wording]`;

// ── Text that means the note is effectively empty ────────────────────────────
const PLACEHOLDER = 'Start typing your notes here...';

/**
 * Test whether `rawText` contains meaningful content worth sending to the AI.
 * FIX (R6): the previous check did an exact-string match against the
 * placeholder, so notes that merely *started* with that phrase were wrongly
 * rejected, and notes containing only whitespace/punctuation were wrongly
 * accepted. This checks for a meaningful content length instead.
 *
 * @param {string} rawText — plain text from the editor (innerText, NOT innerHTML)
 * @returns {boolean}
 */
export function hasMeaningfulContent(rawText) {
    const text = rawText.trim();
    if (!text) return false;
    if (text === PLACEHOLDER) return false;
    // Require at least 3 non-whitespace, non-punctuation characters.
    return text.replace(/[\s.]/g, '').length >= 3;
}

/**
 * Run the AI clean-up for the current note.
 *
 * @param {object} opts
 * @param {number}      opts.noteId     — ID of the note to clean.
 * @param {string}      opts.rawText    — Plain text from the editor.
 * @param {string}      opts.apiKey     — API key provided by the user this session.
 * @param {AIProvider}  opts.provider   — Injected AI provider (swappable / mockable).
 * @param {AbortSignal} [opts.signal]   — Optional external cancellation signal.
 * @returns {Promise<string>}  The clean Markdown, also persisted to the DB.
 * @throws  {Error}  On any failure (offline, empty, API error, shape error).
 */
export async function cleanNote({ noteId, rawText, apiKey, provider, signal }) {
    if (!store.isOnline) {
        throw new Error("You're offline. Connect to the internet to use AI clean-up.");
    }

    if (!hasMeaningfulContent(rawText)) {
        throw new Error('Add some notes before cleaning them up.');
    }

    provider.setApiKey(apiKey);

    const userPrompt = `Here are my raw lecture notes:\n\n${rawText}`;
    const cleanContent = await provider.complete(SYSTEM_PROMPT, userPrompt, { signal });

    await saveCleanContent(noteId, cleanContent);
    return cleanContent;
}
