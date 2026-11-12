/**
 * editor-view.js — Editor + toolbar DOM binding (Phase 3, A1/A4).
 *
 * Owns all DOM reads and writes for the main editor area: the title field,
 * course select, save-status indicator, editor/clean-view toggle, and the
 * AI "Clean this up" button. Like sidebar-view, it subscribes to the store
 * for state-driven updates and delegates business logic to use-cases.
 *
 * UI/UX pass: window.alert()/confirm()/prompt() replaced with toasts and an
 * anchored popover; "Move to trash" no longer blocks on confirm() (it's
 * recoverable — see the trash panel — so we act immediately and offer an
 * inline Undo toast instead, consistent with the brief's preference for
 * contextual, non-modal confirmations for non-destructive actions).
 */

import { store } from '../state/store.js';
import { Editor } from '../components/editor.js';
import { renderMarkdownSafely } from '../util/safe-markdown.js';
import {
    saveContent, saveMetadata,
    trashNote, restoreNote, getNote,
    exportAllNotes, createNote
} from '../usecases/notes.js';
import { cleanNote } from '../usecases/cleanup.js';
import { openInputPopover } from '../ui/popover.js';
import { showToast } from '../ui/toast.js';

// ── Module state ──────────────────────────────────────────────────────────────
let _editor = null;   // Editor instance
let _provider = null;   // Injected AIProvider
let _onRefresh = async () => { };  // Callback → sidebar refresh after writes
let _activeCleanController = null; // AbortController for the in-flight AI request

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the editor view.
 *
 * @param {{
 *   provider: import('../ai/provider.js').AIProvider,
 *   onRefreshNotes: () => Promise<void>,
 *   onNoteCreated: (id: number) => Promise<void>
 * }} opts
 */
export function initEditorView({ provider, onRefreshNotes, onNoteCreated }) {
    _provider = provider;
    _onRefresh = onRefreshNotes;

    // ── Editor setup ─────────────────────────────────────────────────────────
    const editorEl = document.getElementById('editor');
    const toolbarEl = document.querySelector('.editor-toolbar');
    _editor = new Editor(editorEl, toolbarEl);

    editorEl.addEventListener('editor-change', e => {
        if (store.currentNoteId && store.currentView === 'raw') {
            saveContent(store.currentNoteId, e.detail.content);
        }
    });

    // Track which inline formats are active at the caret so the toolbar can
    // reflect state (bold/italic/underline pressed) — a small but real
    // "does this button do anything right now" affordance that was missing
    // before.
    const updateToolbarActiveStates = () => {
        toolbarEl.querySelectorAll('[data-command="bold"],[data-command="italic"],[data-command="underline"]').forEach(btn => {
            try {
                const isActive = document.queryCommandState(btn.dataset.command);
                btn.classList.toggle('is-active', isActive);
            } catch {
                // queryCommandState can throw in some browsers/contexts; the
                // toolbar simply won't show active state in that case.
            }
        });
    };
    editorEl.addEventListener('keyup', updateToolbarActiveStates);
    editorEl.addEventListener('mouseup', updateToolbarActiveStates);
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === editorEl) updateToolbarActiveStates();
    });

    // ── Toolbar / header buttons ──────────────────────────────────────────────
    document.getElementById('btn-new-note').addEventListener('click', async () => {
        const id = await createNote();
        await _onRefresh();
        await openNote(id);
        if (typeof onNoteCreated === 'function') onNoteCreated(id);
    });

    document.getElementById('btn-export').addEventListener('click', async () => {
        const markdown = await exportAllNotes();
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `noteflow-export-${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Notes exported.', { type: 'success', duration: 2500 });
    });

    document.getElementById('btn-clean-notes').addEventListener('click', handleCleanNotes);
    document.getElementById('btn-cancel-clean').addEventListener('click', handleCancelClean);
    document.getElementById('btn-toggle-view').addEventListener('click', handleToggleView);

    document.getElementById('btn-delete-note').addEventListener('click', handleDeleteNote);

    // ── Metadata inputs ───────────────────────────────────────────────────────
    let metaDebounce = null;
    const saveMetaNow = async () => {
        if (!store.currentNoteId) return;
        const title = document.getElementById('note-title').value;
        const courseId = document.getElementById('note-course').value || null;
        await saveMetadata(store.currentNoteId, title, courseId);
        await _onRefresh();
    };

    document.getElementById('note-title').addEventListener('input', () => {
        if (metaDebounce) clearTimeout(metaDebounce);
        metaDebounce = setTimeout(saveMetaNow, 600);
    });

    document.getElementById('note-course').addEventListener('change', saveMetaNow);

    // ── Store subscriptions ───────────────────────────────────────────────────
    store.on('saveStatusChanged', status => {
        updateSaveStatusUI(status);
    });

    store.on('onlineChanged', online => {
        updateOfflineUI(online);
    });

    // Initialise the offline UI state once on boot
    updateOfflineUI(store.isOnline);
}

// ── Save status ────────────────────────────────────────────────────────────────

function updateSaveStatusUI(status) {
    const el = document.getElementById('save-status');
    if (!el) return;
    const textEl = el.querySelector('.status-text');
    if (textEl) textEl.textContent = status;

    if (status === 'Saving…') el.dataset.state = 'saving';
    else if (status === 'Saved') el.dataset.state = 'saved';
    else if (status === 'Save failed') el.dataset.state = 'error';
    else delete el.dataset.state;
}

// ── Open note ─────────────────────────────────────────────────────────────────

/**
 * Open a note by ID: flush any pending autosave, load from DB, populate the
 * DOM. Called both from the controller (boot) and from sidebar clicks.
 * @param {number} noteId
 */
export async function openNote(noteId) {
    // FIX (B4): flush any outgoing note's pending debounced autosave BEFORE we
    // change currentNoteId or the editor content.
    if (_editor) _editor.flushPendingAutosave();

    const note = await getNote(noteId);
    if (!note) return;

    store.setCurrentNoteId(noteId);
    store.setCurrentView('raw');

    document.getElementById('note-title').value = note.title;
    document.getElementById('note-course').value = note.courseId || '';
    _editor.setContent(note.rawContent);

    document.getElementById('editor').classList.remove('hidden');
    document.getElementById('clean-view').classList.add('hidden');

    const toggleBtn = document.getElementById('btn-toggle-view');
    const toggleLabel = document.getElementById('toggle-view-label');
    toggleLabel.textContent = note.cleanContent ? 'View clean' : 'No clean version';
    toggleBtn.disabled = !note.cleanContent;

    store.setSaveStatus('');
}

/** Return the Editor instance (used by the controller for testing). */
export function getEditor() { return _editor; }

// ── AI clean-up ───────────────────────────────────────────────────────────────

async function handleCleanNotes() {
    if (!store.currentNoteId) return;

    const btn = document.getElementById('btn-clean-notes');

    openInputPopover(btn, {
        title: 'AI API key',
        hint: 'Stored only for this session — never saved to disk.',
        placeholder: 'sk-…',
        inputType: 'password',
        confirmLabel: 'Clean up notes',
        onConfirm: apiKey => runCleanNotes(apiKey)
    });
}

async function runCleanNotes(apiKey) {
    const btn = document.getElementById('btn-clean-notes');
    const cancelBtn = document.getElementById('btn-cancel-clean');
    const label = btn.querySelector('.btn-label');
    const originalText = label.textContent;

    btn.disabled = true;
    label.textContent = 'Cleaning up…';
    cancelBtn.classList.remove('hidden');

    const controller = new AbortController();
    _activeCleanController = controller;

    try {
        await cleanNote({
            noteId: store.currentNoteId,
            rawText: _editor.getPlainText(),
            apiKey,
            provider: _provider,
            signal: controller.signal
        });
        await openNote(store.currentNoteId);
        showToast('Your clean notes are ready.', {
            type: 'success',
            actionLabel: 'View clean',
            onAction: handleToggleView
        });
    } catch (err) {
        if (err.name === 'AbortError') {
            showToast('AI clean-up cancelled.', { type: 'info', duration: 3000 });
        } else {
            console.error('AI transformation failed:', err);
            showToast(`Could not clean notes: ${err.message}`, { type: 'error', duration: 7000 });
        }
    } finally {
        btn.disabled = false;
        label.textContent = originalText;
        cancelBtn.classList.add('hidden');
        _activeCleanController = null;
    }
}

function handleCancelClean() {
    if (_activeCleanController) {
        _activeCleanController.abort();
    }
}

// ── View toggle ────────────────────────────────────────────────────────────────

async function handleToggleView() {
    if (!store.currentNoteId) return;
    const note = await getNote(store.currentNoteId);
    if (!note?.cleanContent) return;

    const editorEl = document.getElementById('editor');
    const cleanView = document.getElementById('clean-view');
    const toggleBtn = document.getElementById('btn-toggle-view');
    const toggleLabel = document.getElementById('toggle-view-label');

    if (store.currentView === 'raw') {
        store.setCurrentView('clean');
        editorEl.classList.add('hidden');
        cleanView.classList.remove('hidden');
        // FIX (B7): safe DOM-building renderer — never innerHTML with raw content
        renderMarkdownSafely(note.cleanContent, document.getElementById('clean-content'));
        toggleLabel.textContent = 'View raw';
    } else {
        store.setCurrentView('raw');
        editorEl.classList.remove('hidden');
        cleanView.classList.add('hidden');
        toggleLabel.textContent = 'View clean';
    }
}

// ── Delete (move to trash) ──────────────────────────────────────────────────────

async function handleDeleteNote() {
    if (!store.currentNoteId) return;

    const trashedId = store.currentNoteId;
    const trashedTitle = document.getElementById('note-title').value || 'Untitled note';

    // Trashing is recoverable (see the trash panel), so this proceeds
    // immediately rather than blocking on confirm() — the Undo action in
    // the toast covers the "I didn't mean to" case without interrupting
    // the person up front.
    await trashNote(trashedId);
    store.setCurrentNoteId(null);
    await _onRefresh();

    const id = await createNote();
    await _onRefresh();
    await openNote(id);

    showToast(`"${trashedTitle}" moved to trash.`, {
        type: 'info',
        actionLabel: 'Undo',
        onAction: async () => {
            await restoreNote(trashedId);
            await _onRefresh();
            await openNote(trashedId);
        }
    });
}

// ── Offline UI ────────────────────────────────────────────────────────────────

function updateOfflineUI(online) {
    const btn = document.getElementById('btn-clean-notes');
    if (!btn) return;
    const label = btn.querySelector('.btn-label');
    if (!online) {
        btn.dataset.originalLabel = btn.dataset.originalLabel || label.textContent;
        btn.disabled = true;
        label.textContent = 'Offline';
        btn.title = 'Connect to the internet to use AI clean-up.';
    } else {
        btn.disabled = false;
        label.textContent = btn.dataset.originalLabel || 'Clean this up';
        btn.title = '';
    }
}
