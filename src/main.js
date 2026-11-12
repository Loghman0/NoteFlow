/**
 * main.js — Application bootstrap (Phase 3, A1).
 *
 * This file is intentionally small: it wires the layers together and handles
 * the one concern that spans them all (the DB connection with retry + the
 * in-page error banner). All business logic, DOM manipulation, and state live
 * in the modules imported below.
 *
 * Acceptance criterion from the improvement plan:
 *   "main.js bootstrap file is under ~50 lines of non-comment code and
 *    contains no direct business logic."
 *
 * ── Dependency graph ────────────────────────────────────────────────────────
 *
 *   main.js (bootstrap)
 *     ├─ state/store.js           (observable state)
 *     ├─ views/sidebar-view.js    (DOM ↔ courses/notes)
 *     ├─ views/editor-view.js     (DOM ↔ editor/AI)
 *     ├─ usecases/notes.js        (note CRUD, search, trash)
 *     ├─ usecases/courses.js      (course CRUD)
 *     ├─ usecases/cleanup.js      (AI clean-up)
 *     ├─ utils/database.js        (IndexedDB repository)
 *     ├─ ai/providers/perplexity.js (AI transport adapter)
 *     └─ state/store.js           (single source of UI state)
 */

import { db } from './utils/database.js';
import { store } from './state/store.js';
import {
  initSidebar,
  refreshCourses,
  refreshNotes
} from './views/sidebar-view.js';
import {
  initEditorView,
  openNote
} from './views/editor-view.js';
import {
  createNote,
  listNotes
} from './usecases/notes.js';
import { PerplexityProvider } from './ai/providers/perplexity.js';

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function boot() {
  const connected = await connectWithRetry();
  if (!connected) return;

  const provider = new PerplexityProvider();

  // Wire views — each view module owns its own DOM subscriptions and event
  // listeners; this file just hands them the callbacks they cannot import
  // directly (to avoid circular dependencies).
  initSidebar({ onNoteOpen: openNote });
  initEditorView({
    provider,
    onRefreshNotes: refreshNotes,
    onNoteCreated: () => { }
  });

  // Online / offline state — kept in the store so any view can subscribe
  store.setOnline(navigator.onLine);
  window.addEventListener('online', () => store.setOnline(true));
  window.addEventListener('offline', () => store.setOnline(false));

  // Initial render
  await refreshCourses();
  await refreshNotes();

  // Open/create the most-recent note
  const notes = await listNotes();
  if (notes.length > 0) {
    await openNote(notes[0].id);
  } else {
    const newId = await createNote();
    await refreshNotes();
    await openNote(newId);
  }

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.error('Service worker registration failed:', err)
    );
  }
}

// ── DB connection with retry (R4) ─────────────────────────────────────────────

async function connectWithRetry(attempt = 1) {
  const MAX = 3;
  try {
    await db.connect();
    hideStartupError();
    return true;
  } catch (err) {
    console.error(`db.connect() failed (attempt ${attempt}):`, err);
    if (attempt < MAX) {
      await new Promise(r => setTimeout(r, attempt * 500));
      return connectWithRetry(attempt + 1);
    }
    showStartupError(err);
    return false;
  }
}

function showStartupError(err) {
  let reason = 'We could not open local storage in this browser.';
  if (err?.name === 'VersionError' || err?.name === 'InvalidStateError') {
    reason = 'Local storage could not be opened \u2014 try closing other tabs of this app.';
  } else if (navigator.storage === undefined) {
    reason = 'Local storage isn\u2019t available. Private/incognito browsing often blocks it.';
  }

  let banner = document.getElementById('startup-error');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'startup-error';
    banner.className = 'startup-error';
    banner.setAttribute('role', 'alert');
    document.body.prepend(banner);
  }
  banner.innerHTML = '';

  const msg = document.createElement('span');
  msg.textContent = reason;
  banner.appendChild(msg);

  const retryBtn = document.createElement('button');
  retryBtn.textContent = 'Try again';
  retryBtn.className = 'nav-btn';
  retryBtn.addEventListener('click', boot);
  banner.appendChild(retryBtn);
}

function hideStartupError() {
  document.getElementById('startup-error')?.remove();
}

// ── Entry point ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', boot);
