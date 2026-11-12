/**
 * notes.js — Note use-cases (Phase 3, A1).
 *
 * All note-related business logic lives here. This layer sits between the
 * views (which know about the DOM) and the repository (which knows about
 * IndexedDB). Neither layer should call the other directly.
 *
 * Every function here is independently testable (import db + store mocks,
 * call the function, assert on the mock's call log — no DOM required).
 */

import { db } from '../utils/database.js';
import { store } from '../state/store.js';

// ── read ──────────────────────────────────────────────────────────────────────

/**
 * Load note summaries for the sidebar list, applying the sticky course filter
 * if one is set. Returns summaries sorted newest-first.
 * @returns {Promise<Array>}
 */
export async function listNotes() {
    const courseId = store.selectedCourseId;
    const notes = courseId
        ? await db.getNotesByCourse(courseId)
        : await db.getNoteSummaries();    // Phase 4 (P2): cheap list query
    return notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Search notes by query, respecting the sticky course filter.
 * @param {string} query
 * @returns {Promise<Array>}
 */
export async function searchNotes(query) {
    const q = query.trim();
    if (!q) return listNotes();

    let results = await db.searchNotes(q);
    const courseId = store.selectedCourseId;
    if (courseId) {
        results = results.filter(note => note.courseId === courseId);
    }
    return results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

/**
 * Fetch a full note record (including rawContent and cleanContent).
 * @param {number} id
 * @returns {Promise<object|undefined>}
 */
export async function getNote(id) {
    return db.getNote(id);
}

// ── write ─────────────────────────────────────────────────────────────────────

/**
 * Create a new note and return its id.
 *
 * FIX (UI/UX pass): the editor's placeholder text ("Start typing your notes
 * here…") is now rendered purely via CSS (data-placeholder + ::before) so
 * it's never part of the actual DOM content. New notes must therefore start
 * with genuinely empty content — seeding literal placeholder text into
 * rawContent would (a) get concatenated with whatever the user types next,
 * producing corrupted note content, and (b) reintroduce exactly the
 * "placeholder text sent to the AI as real content" problem the R6 fix was
 * written to prevent.
 * @returns {Promise<number>}
 */
export async function createNote() {
    return db.addNote('Untitled Note', '<p></p>');
}

/**
 * Save raw content for the current note. Updates saveStatus via the store
 * so any subscribed view (e.g. the save-status indicator) reflects progress.
 * @param {number} noteId
 * @param {string} rawContent — innerHTML from the editor
 * @returns {Promise<void>}
 */
export async function saveContent(noteId, rawContent) {
    store.setSaveStatus('Saving…');
    try {
        await db.updateNote(noteId, { rawContent });
        store.setSaveStatus('Saved');
    } catch (err) {
        console.error('Autosave failed:', err);
        store.setSaveStatus('Save failed');
    }
}

/**
 * Save note title and courseId (metadata from the editor header).
 * @param {number} noteId
 * @param {string} title
 * @param {number|null} courseId
 * @returns {Promise<void>}
 */
export async function saveMetadata(noteId, title, courseId) {
    store.setSaveStatus('Saving…');
    try {
        await db.updateNote(noteId, {
            title: title || 'Untitled Note',
            courseId: courseId ? Number(courseId) : null
        });
        store.setSaveStatus('Saved');
    } catch (err) {
        console.error('Metadata save failed:', err);
        store.setSaveStatus('Save failed');
    }
}

/**
 * Save AI-generated cleanContent for a note.
 * @param {number} noteId
 * @param {string} cleanContent
 * @returns {Promise<void>}
 */
export async function saveCleanContent(noteId, cleanContent) {
    await db.updateNote(noteId, { cleanContent });
}

/**
 * Move a note to the trash (soft-delete).
 * @param {number} noteId
 * @returns {Promise<void>}
 */
export async function trashNote(noteId) {
    await db.trashNote(noteId);
}

/**
 * Restore a trashed note back to the main list.
 * @param {number} noteId
 * @returns {Promise<void>}
 */
export async function restoreNote(noteId) {
    await db.restoreNote(noteId);
}

/**
 * Permanently delete a note (only callable from the trash view).
 * @param {number} noteId
 * @returns {Promise<void>}
 */
export async function purgeNote(noteId) {
    await db.purgeNote(noteId);
}

/**
 * Get all soft-deleted notes, sorted most-recently-deleted first.
 * @returns {Promise<Array>}
 */
export async function getTrashedNotes() {
    const notes = await db.getTrashedNotes();
    return notes.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
}

/**
 * Export all notes as a Markdown string (for the Export All button).
 * @returns {Promise<string>}
 */
export async function exportAllNotes() {
    return db.exportAllNotes();
}
