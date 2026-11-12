# StudyNotes AI — Implementation Notes (this pass)

This covers Phase 0 (make it run), Phase 1 (save reliability), Phase 2's XSS fix, and a handful of cheap Phase 5/6/9 wins that were reachable without a larger refactor. It stops before Phase 3 (the architecture split) — see "Not done yet" below.

All fixes were verified directly, not just written and assumed correct:
- Every `.js` file was run through Node's module parser (`node --check`) as an ES module.
- Every path referenced in `index.html`, `src/main.js`'s imports, and `sw.js`'s cache list was diffed against the files that actually exist on disk.
- The new `safe-markdown.js` renderer was fed an XSS-style payload (`<img onerror>`, `<script>`) inside a jsdom document and confirmed to render it as inert literal text — no real `<script>`/`<img>` element is created and no injected code runs — while still correctly producing real `<h1>`/`<h2>`/`<ul><li>`/`<strong>` elements for legitimate Markdown.
- `updateNote()`'s new implementation was confirmed to issue exactly one `db.transaction(...)` call covering both the read and the write, which is what makes it atomic.

## Fixed (verified)

| # | Bug | Fix |
|---|---|---|
| B1 | Fatal `SyntaxError` from a raw newline inside a regex literal in `markdownToHtml()` — broke module parsing, so **nothing in the app ran at all** | Removed the regex-based HTML-string approach entirely; replaced with `src/util/safe-markdown.js`, a renderer that builds DOM nodes directly and never touches `innerHTML` or regex-based HTML construction |
| B2 | Every cross-file path (`index.html`, `main.js` imports, `sw.js` cache list) pointed at a nested `src/`/`styles/` structure that didn't exist in the delivered files | Adopted the nested structure the README already documented (`src/main.js`, `src/components/editor.js`, `src/utils/*.js`, `src/styles/main.css`) and fixed every reference to match it; `sw.js`, `manifest.json`, and `favicon.svg` were deliberately kept at the project root (not under a `public/` folder as the old README implied) because a service worker's cache scope needs to cover the whole site, which requires it to be served from the root |
| B3 | `favicon.svg` was referenced by `index.html`, `manifest.json`, and `sw.js` but didn't exist anywhere in the project, which made `sw.js`'s `cache.addAll()` fail atomically and the service worker never install | Added a real `favicon.svg`; rewrote `sw.js`'s cache list to only contain paths that are now real |
| B4 | Cross-note autosave race: a pending 1s-debounced autosave read `currentNoteId`/editor content *at fire time*, with nothing to cancel or flush it on note switch | Added `Editor.flushPendingAutosave()`; `main.js`'s `openNote()` now calls it synchronously *before* changing `currentNoteId` or swapping editor content, so the outgoing note's last edit is guaranteed to save correctly before anything else changes |
| B5 | Lost-update race in `Database.updateNote()`: read (`getNote`) and write (`put`) happened in two separate transactions, so two concurrent callers could each read stale data and clobber each other's change | Rewrote `updateNote()` to perform the get and the put inside a single `readwrite` transaction, which IndexedDB serializes against the same store — removing the race window |
| B6 | Highlighter toolbar buttons had no `data-command="highlight"`, so clicking them silently did nothing | Added `data-command="highlight"` (and `aria-label`s) to all three highlight buttons in `index.html` |
| B7 | AI-returned `cleanContent` was rendered via a hand-rolled regex Markdown parser and injected with `innerHTML` — a real stored-XSS vector if a model ever echoed back injected markup | `renderMarkdownSafely()` (new file) parses the constrained Markdown subset itself and constructs `h1`–`h3`/`ul`/`li`/`p`/`strong` elements directly via `createElement`/`textContent` — arbitrary text can never be interpreted as HTML, verified with an actual injection payload (see above) |
| R1 | `ai-service.js` accessed `data.choices[0].message.content` with no validation; a malformed response threw a cryptic `TypeError` | Added explicit validation of the HTTP status (with the provider's error message surfaced when available) and of the response shape, with clear thrown error messages either way |
| R2 | No timeout or cancellation on the AI `fetch`; a hung request left the button disabled indefinitely | Added an `AbortController` with a 40s timeout |
| R5 | Course filter selection wasn't sticky — the next `loadNotes()` call (triggered by almost any save) silently reset to "all notes" with no indication of which course was selected | `selectedCourseId` is now tracked explicitly, re-applied after every list refresh via the indexed `getNotesByCourse()` query, and given an `.active` style matching the existing note-item pattern |
| — | `getNotesByCourse()` filtered every note client-side instead of using the existing `courseId` index (flagged as P3/performance in the audit) | Rewrote to query the index directly with `IDBKeyRange` |
| — | `updateSaveStatus()` was a stub (`console.log` only) despite the UI implying a real indicator | Added a `#save-status` element in `index.html` and wired it to show "Saving…" / "Saved" / "Save failed" |
| — | `outline: none` on the editor and title input with no replacement, removing all keyboard focus visibility | Added a `:focus-visible` outline in `main.css` (doesn't affect mouse users) |
| — | Dead `isCleanView` field, written on every note but never read anywhere | Removed from `addNote()` |
| — | AI system prompt allowed the model to return arbitrary Markdown | Added one line asking it to stick to plain headings/bold/bullets and not emit raw HTML — defense-in-depth alongside the B7 fix, not a replacement for it |
| — | README described a file structure and "✅ built" feature list that didn't match reality | Rewritten to describe the actual current structure and an honest "fixed vs. still open" status |

## Not done yet (ran out of scope for this pass — still tracked in the original master plan)

These weren't skipped by accident; they're the larger, higher-effort items from Phases 3/6/7/8/9/10 of the master plan that don't fit a single implementation pass:

- **Phase 3 (architecture split):** `main.js` is still one 250-ish-line controller. It was *not* split into the view/store/use-case layers the plan describes — doing that safely really wants the characterization tests from Phase 7 in place first, and is a broad, mechanical, high-file-count change in its own right.
- **S1 (AI key exposure):** the API key is still sent directly from the browser to the AI provider. A backend proxy is a real (if small) service to design and stand up — deliberately out of scope for this pass; the risk is still called out in the README.
- **S2 (CSP):** no Content-Security-Policy meta tag was added yet.
- **Phase 4 (performance at scale):** list virtualization/diffing wasn't done — `renderNotes()` still rebuilds the whole sidebar `innerHTML` on every refresh. The one specific item that *was* addressed is the indexed course query (previously O(all notes), now indexed).
- **Phase 6 (PWA, beyond the path fix):** `sw.js` now installs correctly and cleans up old cache versions on `activate`, but still uses a simple cache-first strategy for everything; a network-first strategy for HTML/JS (so updates propagate faster) wasn't implemented, and `manifest.json` still only has one SVG icon rather than the 192/512 PNG set most install-prompt heuristics expect.
- **Phase 7 (tests/CI):** no automated test suite or CI was added. The verification done for this pass (Node syntax checks, a one-off jsdom injection test, a static transaction-count check) was manual and ad hoc, not a committed test suite.
- **Phase 8 (AI provider abstraction):** `ai-service.js` still hardcodes one vendor's URL/model/response shape directly; it wasn't split into an interface + adapter.
- **Phase 9 (missing core features):** no search, no trash/soft-delete, no course rename/delete were added.
- **R3/R4/R6** (offline gating on the AI button, a retry action on `db.connect()` failure, and the fragile placeholder-string check in `cleanNotes()`) were left as-is.
- `demo.html` was copied over unchanged — its path reference to `src/utils/ai-service.js` happens to already be correct under the new structure, but its "✅ built" claims weren't re-audited against this revision the way `README.md`'s were.

If you want the next pass to pick up from here, Phase 3 (splitting `main.js`) and Phase 7 (a real test suite) are the two highest-leverage next steps — nearly everything else in the "not done yet" list gets easier and safer once those two exist.

---

## Second pass — R3/R4/R6, S2, and Phase 9 core features

This pass picked up where the first pass's "Not done yet" list left off, focusing on cheap-but-real reliability fixes and the highest-value missing features that don't require the Phase 3 architecture split first.

All fixes were verified directly:
- `node --check` on every `.js` file.
- Every `getElementById()` call in `main.js` cross-checked against `index.html`'s actual `id` attributes via a script (all resolve; the one dynamically-created id, `startup-error`, is created by JS by design).
- The full app was booted end-to-end in jsdom + fake-indexeddb (note creation, search, course add/rename/delete-with-reassignment, and the full trash → restore cycle were all exercised and produced correct results).
- The offline-gating fix (R3) was specifically re-verified after an initial test-harness mistake (importing `main.js` as a plain Node module bound `navigator` to Node's own global instead of the page's `window.navigator`) gave a false negative; with `navigator` correctly bound to the jsdom window before import, the button's disabled state, label, and tooltip all toggle correctly on `navigator.onLine` changes and on real `online`/`offline` events.
- The R4 retry/banner path was verified against a `db.connect()` that always rejects: confirmed exactly 3 attempts with backoff, then a startup-error banner with a working "Try again" button.

### Fixed (verified)

| # | Problem | Fix |
|---|---|---|
| R3 | No `navigator.onLine` gating on the AI action — clicking "Clean this up" offline produced an opaque network-failure alert after a doomed fetch attempt | `updateOfflineState()` proactively disables/relabels the button based on `navigator.onLine`, called on init and re-run on the `online`/`offline` window events; `cleanNotes()` also short-circuits with a clear message if offline |
| R4 | `db.connect()` failure was a single blocking `alert()` with no retry, permanently locking the user out of a transient error (private browsing, quota, momentary browser bug) | Added `connectWithRetry()` (3 attempts, short backoff) and a dismissible in-page banner (not `alert()`) with a "Try again" button and a message that distinguishes likely causes instead of a generic failure |
| R6 | The empty-notes check in `cleanNotes()` did an exact string match against the placeholder text, so notes merely *starting with* that phrase were wrongly rejected while whitespace/punctuation-only notes were wrongly accepted | Replaced with a meaningful-content-length check; the placeholder string is now only treated as a signal when it's the *entire* content, not a prefix |
| S2 | No Content-Security-Policy | Added a CSP meta tag to `index.html`: same-origin scripts only, `connect-src` restricted to the AI provider's API, no framing, no inline scripts — defense-in-depth alongside the existing B7 sanitizer fix |
| — | No search across notes | Added `db.searchNotes()` (title + raw + clean content) wired to a debounced sidebar search input; results respect the sticky course filter, show a result count, and show a plain-text match snippet (built via `textContent`, never `innerHTML`) |
| — | No trash/soft-delete — "Delete" was a single `confirm()` gating a permanent, unrecoverable delete | Notes now get a `deletedAt` field on delete instead of being removed; `getAllNotes()`/`getNotesByCourse()` filter these out. Added a trash panel (toolbar button) listing trashed notes with Restore / Delete forever actions |
| — | No course rename/delete | Added `db.renameCourse()` and `db.deleteCourse()` (the latter reassigns the course's notes to "No Course" rather than deleting them); wired into the sidebar with hover-revealed action buttons on each course row |
| — | Stale, pre-fix duplicate files at the project root (`main.js`, `editor.js`, `database.js`, `ai-service.js`, `main.css`) sitting alongside the real `src/` tree, unreferenced by `index.html` but a live documentation/confusion hazard flagged in the master plan | Removed; confirmed via `diff` against the `src/` versions that they were the old, pre-B1/B4/B5/B7-fix files before deleting |
| — | README's "Still open" list said there was no search/trash/course-management, which was no longer true after this pass | Updated to reflect what's now fixed vs. still open |

### Not done yet (still open — same items as before, minus what's now checked off above)

- **Phase 3 (architecture split):** `main.js` is still one large controller (now larger, since this pass added to it rather than splitting it — splitting it is still the top recommended next step).
- **S1 (AI key exposure):** the API key is still sent directly from the browser. A backend proxy remains out of scope for this pass.
- **Phase 4 (performance at scale):** `renderNotes()` still rebuilds the sidebar from scratch on every refresh (no virtualization/diffing); `searchNotes()` is a full in-memory scan of non-trashed notes, fine at today's expected note counts but not indexed.
- **Phase 6 (PWA, beyond the path fix):** still cache-first-always with no network-first strategy for HTML/JS; `manifest.json` still only has one SVG icon.
- **Phase 7 (tests/CI):** still no committed automated test suite or CI — verification for both passes was manual/ad hoc (Node syntax checks, jsdom smoke tests, static diffs), not a checked-in suite.
- **Phase 8 (AI provider abstraction):** `ai-service.js` still hardcodes one vendor's URL/model/response shape.
- **R6's underlying limitation:** the new length-based check is still a heuristic, not real content analysis — it's meaningfully more robust than an exact-string match but can still be fooled by, e.g., three characters of punctuation-adjacent text.
- Trashed notes have no automatic purge/expiry — they stay in the trash indefinitely until a user manually empties them one at a time; a "trash notes older than N days" sweep was not implemented.
- No confirmation-free "Undo" toast on trash (the trash panel itself serves as the recovery path, but a lighter-weight undo-immediately-after-delete affordance wasn't added).

If you want a third pass to pick up from here, Phase 7 (a real, committed test suite — the jsdom-based checks from both passes would be a reasonable starting point to formalize) is probably the highest-leverage next step, since it would let Phase 3's architecture split happen safely.
