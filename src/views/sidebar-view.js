/**
 * sidebar-view.js — Sidebar DOM binding (Phase 3, A1/A4).
 *
 * This module owns all DOM reads and writes for the sidebar: the course list,
 * the notes list, the search input, and the trash button. It subscribes to
 * relevant store events so it automatically re-renders when state changes,
 * rather than being told to re-render imperatively from every call site.
 *
 * Business logic does NOT live here — clicks dispatch to use-case functions
 * (courses.js / notes.js) which update the store, which triggers the
 * subscription here. The data flow is: user action → use-case → store event
 * → view re-render.
 *
 * UI/UX pass: window.prompt()/confirm() replaced with anchored popovers and
 * toasts (see src/ui/popover.js, src/ui/toast.js); the trash overlay is now
 * a slide-over panel with enter/exit transitions instead of a static modal;
 * the sidebar itself becomes an off-canvas panel on mobile, toggled from
 * the header.
 */

import { store } from '../state/store.js';
import { listNotes, searchNotes, getTrashedNotes, restoreNote, purgeNote } from '../usecases/notes.js';
import {
    listCourses, addCourse,
    renameCourse, deleteCourse,
    setCourseFilter
} from '../usecases/courses.js';
import { escapeHtml } from '../util/html.js';
import { openInputPopover } from '../ui/popover.js';
import { showToast } from '../ui/toast.js';

// ── Module-level state ───────────────────────────────────────────────────────
let _searchQuery = '';
let _searchDebounce = null;
let _onNoteOpen = async () => { };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Wire up the sidebar: bind DOM events and subscribe to store events so the
 * sidebar stays in sync automatically.
 *
 * @param {{ onNoteOpen: (id: number) => Promise<void> }} callbacks
 */
export function initSidebar({ onNoteOpen }) {
    _onNoteOpen = onNoteOpen;

    // ── Search ───────────────────────────────────────────────────────────────
    document.getElementById('note-search').addEventListener('input', e => {
        const value = e.target.value;
        if (_searchDebounce) clearTimeout(_searchDebounce);
        _searchDebounce = setTimeout(() => {
            _searchQuery = value;
            refreshNotes();
        }, 200);
    });

    // ── Add course (popover instead of prompt()) ──────────────────────────────
    const addCourseBtn = document.getElementById('btn-add-course');
    addCourseBtn.addEventListener('click', () => {
        openInputPopover(addCourseBtn, {
            title: 'New course',
            placeholder: 'e.g. Organic Chemistry',
            confirmLabel: 'Add',
            onConfirm: async name => {
                await addCourse(name);
                await refreshCourses();
                await refreshNotes();
                showToast(`"${name}" added.`, { type: 'success', duration: 2500 });
            }
        });
    });

    // ── Mobile off-canvas sidebar toggle ──────────────────────────────────────
    const sidebarEl = document.getElementById('sidebar');
    const scrimEl = document.getElementById('sidebar-scrim');
    const toggleBtn = document.getElementById('btn-sidebar-toggle');

    // Only relevant on narrow viewports; the button is hidden via CSS on
    // desktop, but guard here too in case CSS fails to load.
    const closeMobileSidebar = () => {
        sidebarEl.classList.remove('open');
        scrimEl.classList.remove('open');
        toggleBtn.setAttribute('aria-expanded', 'false');
    };
    const openMobileSidebar = () => {
        sidebarEl.classList.add('open');
        scrimEl.classList.add('open');
        toggleBtn.setAttribute('aria-expanded', 'true');
    };
    toggleBtn.addEventListener('click', () => {
        sidebarEl.classList.contains('open') ? closeMobileSidebar() : openMobileSidebar();
    });
    scrimEl.addEventListener('click', closeMobileSidebar);
    // Close the mobile sidebar automatically after picking a note — the
    // point of opening it was to navigate, and leaving it open would hide
    // the editor immediately after the choice.
    store.on('noteChanged', () => {
        if (isMobileViewport()) closeMobileSidebar();
    });

    // ── Trash panel ──────────────────────────────────────────────────────────
    document.getElementById('btn-trash').addEventListener('click', openTrash);
    document.getElementById('btn-close-trash').addEventListener('click', closeTrash);
    document.getElementById('trash-panel').addEventListener('click', e => {
        if (e.target.id === 'trash-panel') closeTrash();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !document.getElementById('trash-panel').classList.contains('hidden')) {
            closeTrash();
        }
    });

    // ── Store subscriptions ──────────────────────────────────────────────────
    store.on('courseFilterChanged', async () => {
        await refreshCourses();
        await refreshNotes();
    });

    store.on('noteChanged', id => {
        highlightActiveNote(id);
    });
}

// ── Refresh helpers ───────────────────────────────────────────────────────────

/** Re-render the course list from the DB. */
export async function refreshCourses() {
    const courses = await listCourses();
    renderCourses(courses);
    renderCourseSelect(courses);
}

/** Re-render the notes list, applying search and course filter. */
export async function refreshNotes() {
    const q = _searchQuery.trim();
    let notes;
    if (q) {
        notes = await searchNotes(q);
        document.getElementById('notes-section-heading').textContent =
            `Notes — ${notes.length} result${notes.length === 1 ? '' : 's'}`;
    } else {
        notes = await listNotes();
        document.getElementById('notes-section-heading').textContent = 'Notes';
    }
    renderNotes(notes, q);
}

// ── Render functions ──────────────────────────────────────────────────────────

function renderCourses(courses) {
    const courseList = document.getElementById('course-list');
    courseList.innerHTML = '';

    for (const course of courses) {
        const row = document.createElement('div');
        row.className = 'course-item-row' +
            (course.id === store.selectedCourseId ? ' active' : '');
        row.dataset.courseId = String(course.id);

        const label = document.createElement('button');
        label.type = 'button';
        label.className = 'course-item-label';

        const dot = document.createElement('span');
        dot.className = 'dot';
        label.appendChild(dot);

        const nameSpan = document.createElement('span');
        nameSpan.textContent = course.name;
        nameSpan.style.overflow = 'hidden';
        nameSpan.style.textOverflow = 'ellipsis';
        label.appendChild(nameSpan);

        label.addEventListener('click', () => setCourseFilter(course.id));
        row.appendChild(label);

        const actions = document.createElement('span');
        actions.className = 'course-item-actions';

        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.setAttribute('aria-label', `Rename ${course.name}`);
        renameBtn.title = 'Rename';
        renameBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 2.5l2 2L5 13H3v-2l8.5-8.5z"/></svg>';
        renameBtn.addEventListener('click', e => {
            e.stopPropagation();
            openInputPopover(renameBtn, {
                title: 'Rename course',
                initialValue: course.name,
                confirmLabel: 'Save',
                onConfirm: async newName => {
                    if (newName === course.name) return;
                    await renameCourse(course.id, newName);
                    await refreshCourses();
                    await refreshNotes();
                }
            });
        });
        actions.appendChild(renameBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'danger';
        deleteBtn.setAttribute('aria-label', `Delete ${course.name}`);
        deleteBtn.title = 'Delete';
        deleteBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M4.5 4.5l.6 8.4a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8.4"/></svg>';
        deleteBtn.addEventListener('click', async e => {
            e.stopPropagation();
            // A course delete only reassigns its notes (never deletes them),
            // so this is low-stakes enough for a toast+undo pattern instead
            // of a blocking confirm() — matches the brief's preference for
            // contextual, non-modal confirmations.
            const courseId = course.id;
            const courseName = course.name;
            await deleteCourse(courseId);
            await refreshCourses();
            await refreshNotes();
            showToast(`"${courseName}" deleted. Notes moved to No course.`, {
                type: 'info',
                duration: 6000
            });
        });
        actions.appendChild(deleteBtn);

        row.appendChild(actions);
        courseList.appendChild(row);
    }
}

function renderCourseSelect(courses) {
    const select = document.getElementById('note-course');
    select.innerHTML = `<option value="">No course</option>` +
        courses.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
}

export function renderNotes(notes, highlightQuery = '') {
    const notesList = document.getElementById('notes-list');
    notesList.innerHTML = '';

    if (notes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = highlightQuery ? 'No notes match your search.' : 'No notes yet — create one to get started.';
        notesList.appendChild(empty);
        return;
    }

    for (const note of notes) {
        const item = document.createElement('div');
        item.className = 'note-item';
        item.dataset.noteId = String(note.id);
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');

        const titleEl = document.createElement('div');
        titleEl.className = 'note-item-title';
        titleEl.textContent = note.title;
        item.appendChild(titleEl);

        if (highlightQuery) {
            const snippet = buildSnippet(note, highlightQuery);
            if (snippet) {
                const snippetEl = document.createElement('div');
                snippetEl.className = 'note-item-snippet';
                snippetEl.textContent = snippet;
                item.appendChild(snippetEl);
            }
        }

        const dateEl = document.createElement('div');
        dateEl.className = 'note-item-date';
        dateEl.textContent = new Date(note.updatedAt).toLocaleDateString();
        item.appendChild(dateEl);

        const open = () => _onNoteOpen(note.id);
        item.addEventListener('click', open);
        item.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        });
        notesList.appendChild(item);
    }

    highlightActiveNote(store.currentNoteId);
}

export function highlightActiveNote(noteId) {
    document.querySelectorAll('.note-item').forEach(item => {
        item.classList.toggle('active', Number(item.dataset.noteId) === noteId);
    });
}

// ── Snippet helpers ───────────────────────────────────────────────────────────

/**
 * Build a plain-text excerpt around the first match of `query` in the note's
 * content. Built with textContent only — never innerHTML — so AI-returned
 * cleanContent can never introduce a rendering vector here.
 */
function buildSnippet(note, query) {
    const q = query.toLowerCase();
    const plainRaw = stripHtml(note.rawContent || '');
    const sources = [plainRaw, note.cleanContent || ''];
    for (const source of sources) {
        const idx = source.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 30);
        const end = Math.min(source.length, idx + q.length + 30);
        return (start > 0 ? '…' : '') +
            source.slice(start, end).replace(/\s+/g, ' ').trim() +
            (end < source.length ? '…' : '');
    }
    return '';
}

function stripHtml(html) {
    return String(html).replace(/<[^>]*>/g, ' ');
}

/**
 * Defensive matchMedia check — some embedding contexts (certain test
 * environments, older/locked-down webviews) don't implement
 * window.matchMedia. Falls back to false (never auto-close) rather than
 * throwing, since this behavior is a convenience, not a requirement.
 */
function isMobileViewport() {
    if (typeof window.matchMedia !== 'function') return false;
    try {
        return window.matchMedia('(max-width: 768px)').matches;
    } catch {
        return false;
    }
}

// ── Trash panel (slide-over) ────────────────────────────────────────────────

async function openTrash() {
    const panel = document.getElementById('trash-panel');
    panel.classList.remove('hidden');
    // Two-step so the transition actually runs (class must be added after
    // the element is painted with .hidden removed).
    requestAnimationFrame(() => panel.classList.add('open'));
    await renderTrash();
}

function closeTrash() {
    const panel = document.getElementById('trash-panel');
    panel.classList.remove('open');
    setTimeout(() => panel.classList.add('hidden'), 260); // matches --duration-slow
}

async function renderTrash() {
    const trashed = await getTrashedNotes();
    const list = document.getElementById('trash-list');
    list.innerHTML = '';

    if (trashed.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'Trash is empty.';
        list.appendChild(empty);
        return;
    }

    for (const note of trashed) {
        const row = document.createElement('div');
        row.className = 'trash-item';

        const info = document.createElement('div');
        info.style.minWidth = '0';
        const title = document.createElement('div');
        title.className = 'trash-item-title';
        title.textContent = note.title;
        info.appendChild(title);

        const date = document.createElement('div');
        date.className = 'trash-item-date';
        date.textContent = `Deleted ${new Date(note.deletedAt).toLocaleDateString()}`;
        info.appendChild(date);
        row.appendChild(info);

        const actions = document.createElement('div');
        actions.className = 'trash-item-actions';

        const restoreBtn = document.createElement('button');
        restoreBtn.setAttribute('aria-label', `Restore ${note.title}`);
        restoreBtn.title = 'Restore';
        restoreBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8a5 5 0 109-3M3 8V4M3 8h4"/></svg>';
        restoreBtn.addEventListener('click', async () => {
            await restoreNote(note.id);
            await renderTrash();
            await refreshNotes();
            showToast(`"${note.title}" restored.`, { type: 'success', duration: 2500 });
        });
        actions.appendChild(restoreBtn);

        const purgeBtn = document.createElement('button');
        purgeBtn.className = 'danger';
        purgeBtn.setAttribute('aria-label', `Delete ${note.title} forever`);
        purgeBtn.title = 'Delete forever';
        purgeBtn.innerHTML = '<svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M6.5 4.5V3a1 1 0 011-1h1a1 1 0 011 1v1.5M4.5 4.5l.6 8.4a1 1 0 001 .9h3.8a1 1 0 001-.9l.6-8.4"/></svg>';
        purgeBtn.addEventListener('click', () => {
            // Permanent, unrecoverable — this is the one action in the app
            // that still warrants a genuine confirmation step, done as an
            // anchored popover rather than a native confirm() dialog.
            openInputPopover(purgeBtn, {
                title: `Delete "${note.title}" forever?`,
                hint: 'This cannot be undone. Type DELETE to confirm.',
                placeholder: 'DELETE',
                confirmLabel: 'Delete forever',
                confirmVariant: 'danger',
                onConfirm: async (value) => {
                    if (value.trim().toUpperCase() !== 'DELETE') {
                        showToast('Deletion cancelled — confirmation text did not match.', { type: 'info' });
                        return;
                    }
                    await purgeNote(note.id);
                    if (store.currentNoteId === note.id) {
                        store.setCurrentNoteId(null);
                    }
                    await renderTrash();
                    await refreshNotes();
                    showToast(`"${note.title}" permanently deleted.`, { type: 'info' });
                }
            });
        });
        actions.appendChild(purgeBtn);

        row.appendChild(actions);
        list.appendChild(row);
    }
}
