/**
 * note-lifecycle.test.js — Integration test for the core note save flow.
 *
 * Phase 7 / Improvement plan §12:
 *   "Integration: Full 'create note → edit → autosave → reload → content
 *    persisted' flow against a real (fake-indexeddb) IndexedDB; 'switch
 *    notes mid-debounce' flow reproducing B4."
 *
 * Uses fake-indexeddb and exercises the real Database methods in the same
 * call sequence the app uses, to catch cross-module regressions.
 */

import 'fake-indexeddb/auto';
import { Database } from '../../src/utils/database.js';

async function freshDb() {
    const db = new Database(`IntegDB-${Math.random().toString(36).slice(2)}`);
    await db.connect();
    return db;
}

// ── Full note lifecycle ────────────────────────────────────────────────────────

describe('Note lifecycle integration', () => {
    test('create → edit title → edit content → reopen: all persisted', async () => {
        const db = await freshDb();

        // Create
        const id = await db.addNote('Draft', '<p>Initial content</p>');

        // Simulate title save (metadata save)
        await db.updateNote(id, { title: 'Biology Lecture 1' });

        // Simulate content autosave
        await db.updateNote(id, { rawContent: '<p>Mitochondria is the powerhouse of the cell.</p>' });

        // "Reload": re-open the note from the DB — simulates a page refresh
        const saved = await db.getNote(id);
        expect(saved.title).toBe('Biology Lecture 1');
        expect(saved.rawContent).toBe('<p>Mitochondria is the powerhouse of the cell.</p>');
    });

    test('autosave + metadata update in the same second do not lose either (B5)', async () => {
        const db = await freshDb();
        const id = await db.addNote('Original', '<p>draft</p>');

        // Simulate concurrent title edit and content autosave (what the editor
        // does when a user types title and content within the same second).
        const [,] = await Promise.all([
            db.updateNote(id, { title: 'Final Title' }),
            db.updateNote(id, { rawContent: '<p>Final content typed by student</p>' })
        ]);

        const saved = await db.getNote(id);
        expect(saved.title).toBe('Final Title');
        expect(saved.rawContent).toBe('<p>Final content typed by student</p>');
    });

    test('soft-delete → sidebar excludes note → restore → reappears (trash cycle)', async () => {
        const db = await freshDb();
        const id = await db.addNote('Temp Note', '<p></p>');

        // Sidebar should show it
        let visible = await db.getAllNotes();
        expect(visible.map(n => n.id)).toContain(id);

        // Soft-delete
        await db.trashNote(id);

        // Sidebar should NOT show it
        visible = await db.getAllNotes();
        expect(visible.map(n => n.id)).not.toContain(id);

        // Trash panel should show it
        const trashed = await db.getTrashedNotes();
        expect(trashed.map(n => n.id)).toContain(id);

        // Restore
        await db.restoreNote(id);

        // Sidebar should show it again
        visible = await db.getAllNotes();
        expect(visible.map(n => n.id)).toContain(id);
    });

    test('course filter with index returns only notes for that course', async () => {
        const db = await freshDb();

        const courseId = await db.addCourse('Chemistry');
        const otherCourseId = await db.addCourse('History');

        const chemId1 = await db.addNote('Chem 1', '<p></p>');
        await db.updateNote(chemId1, { courseId });
        const chemId2 = await db.addNote('Chem 2', '<p></p>');
        await db.updateNote(chemId2, { courseId });
        const histId = await db.addNote('History 1', '<p></p>');
        await db.updateNote(histId, { courseId: otherCourseId });

        const chemNotes = await db.getNotesByCourse(courseId);
        expect(chemNotes).toHaveLength(2);
        expect(chemNotes.map(n => n.id)).not.toContain(histId);
    });

    test('search finds a note by content, not just title', async () => {
        const db = await freshDb();
        await db.addNote('General Biology', '<p>Cells are the basic unit of life</p>');
        const results = await db.searchNotes('basic unit of life');
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].title).toBe('General Biology');
    });

    test('getNoteSummaries returns shallow copies without content blobs', async () => {
        const db = await freshDb();
        const id = await db.addNote('Test Note', '<p>Very long content goes here...</p>');
        await db.updateNote(id, { cleanContent: '# Clean\n\n## Summary\nShort' });

        const summaries = await db.getNoteSummaries();
        const found = summaries.find(s => s.id === id);
        expect(found).toBeDefined();
        expect(found.hasCleanContent).toBe(true);
        expect(found.rawContent).toBeUndefined();
        expect(found.cleanContent).toBeUndefined();
    });
});
