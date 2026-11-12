/**
 * database.test.js — Unit tests for the IndexedDB repository layer.
 *
 * Phase 7 / Improvement plan §12:
 *   "Unit — data layer: Database.updateNote() concurrency behavior (reproduce
 *    B5 before fixing it); addNote/getNote/deleteNote round-trips;
 *    getNotesByCourse index correctness."
 *
 * Uses fake-indexeddb to run IndexedDB in Node without a browser.
 */

import 'fake-indexeddb/auto';
import { Database } from '../../src/utils/database.js';

// ── helpers ───────────────────────────────────────────────────────────────────

/** Create a fresh, connected Database instance with a unique DB name so tests
 *  are isolated from each other even when run in parallel. */
async function freshDb(name = `TestDB-${Math.random().toString(36).slice(2)}`) {
    const db = new Database(name);
    await db.connect();
    return db;
}

// ── addNote / getNote ─────────────────────────────────────────────────────────

describe('addNote / getNote', () => {
    test('round-trips title and content', async () => {
        const db = await freshDb();
        const id = await db.addNote('My Note', '<p>Hello</p>');
        const note = await db.getNote(id);
        expect(note.title).toBe('My Note');
        expect(note.rawContent).toBe('<p>Hello</p>');
        expect(note.cleanContent).toBeNull();
        expect(note.courseId).toBeNull();
        expect(note.createdAt).toBeDefined();
        expect(note.updatedAt).toBeDefined();
    });

    test('returns undefined for a nonexistent id', async () => {
        const db = await freshDb();
        const note = await db.getNote(99999);
        expect(note).toBeUndefined();
    });
});

// ── updateNote (B5 regression) ────────────────────────────────────────────────

describe('updateNote — transactional correctness (B5 regression)', () => {
    test('merges partial updates without losing unchanged fields', async () => {
        const db = await freshDb();
        const id = await db.addNote('Original Title', '<p>Content</p>');
        await db.updateNote(id, { title: 'New Title' });
        const note = await db.getNote(id);
        expect(note.title).toBe('New Title');
        expect(note.rawContent).toBe('<p>Content</p>');  // not overwritten
    });

    test('concurrent title + content updates do not lose either change (B5)', async () => {
        const db = await freshDb();
        const id = await db.addNote('Title', '<p>Old content</p>');

        // Fire both updates concurrently — the race that B5 describes.
        // With a single-transaction implementation both changes must survive.
        await Promise.all([
            db.updateNote(id, { title: 'Updated Title' }),
            db.updateNote(id, { rawContent: '<p>Updated content</p>' }),
        ]);

        const note = await db.getNote(id);
        expect(note.title).toBe('Updated Title');
        expect(note.rawContent).toBe('<p>Updated content</p>');
    });

    test('rejects for a nonexistent id', async () => {
        const db = await freshDb();
        await expect(db.updateNote(99999, { title: 'x' })).rejects.toThrow('Note not found');
    });

    test('updates updatedAt even when no content changes', async () => {
        const db = await freshDb();
        const id = await db.addNote('T', '<p></p>');
        const before = (await db.getNote(id)).updatedAt;
        // Small delay to guarantee a different timestamp
        await new Promise(r => setTimeout(r, 10));
        await db.updateNote(id, { title: 'T2' });
        const after = (await db.getNote(id)).updatedAt;
        expect(after > before).toBe(true);
    });
});

// ── getAllNotes / getNoteSummaries ─────────────────────────────────────────────

describe('getAllNotes / getNoteSummaries', () => {
    test('getAllNotes excludes soft-deleted notes', async () => {
        const db = await freshDb();
        const id1 = await db.addNote('Alive', '<p></p>');
        const id2 = await db.addNote('Trashed', '<p></p>');
        await db.trashNote(id2);
        const notes = await db.getAllNotes();
        expect(notes.map(n => n.id)).toContain(id1);
        expect(notes.map(n => n.id)).not.toContain(id2);
    });

    test('getNoteSummaries returns lightweight objects without content blobs', async () => {
        const db = await freshDb();
        const id = await db.addNote('Summary Test', '<p>lots of content</p>');
        const summaries = await db.getNoteSummaries();
        const s = summaries.find(x => x.id === id);
        expect(s).toBeDefined();
        expect(s.title).toBe('Summary Test');
        expect(s.updatedAt).toBeDefined();
        // rawContent and cleanContent must NOT be present — that's the whole point
        expect(s.rawContent).toBeUndefined();
        expect(s.cleanContent).toBeUndefined();
        expect(typeof s.hasCleanContent).toBe('boolean');
    });

    test('getNoteSummaries excludes trashed notes', async () => {
        const db = await freshDb();
        const id = await db.addNote('Trash me', '<p></p>');
        await db.trashNote(id);
        const summaries = await db.getNoteSummaries();
        expect(summaries.map(s => s.id)).not.toContain(id);
    });
});

// ── getNotesByCourse (P3 index correctness) ───────────────────────────────────

describe('getNotesByCourse', () => {
    test('uses the courseId index and returns only matching notes', async () => {
        const db = await freshDb();
        const courseId = await db.addCourse('Biology');
        const id1 = await db.addNote('Biology note 1', '<p></p>');
        await db.updateNote(id1, { courseId });
        const id2 = await db.addNote('Biology note 2', '<p></p>');
        await db.updateNote(id2, { courseId });
        await db.addNote('No-course note', '<p></p>');  // courseId = null

        const results = await db.getNotesByCourse(courseId);
        expect(results).toHaveLength(2);
        expect(results.map(n => n.id).sort()).toEqual([id1, id2].sort());
    });

    test('excludes trashed notes from course results', async () => {
        const db = await freshDb();
        const courseId = await db.addCourse('History');
        const id = await db.addNote('History note', '<p></p>');
        await db.updateNote(id, { courseId });
        await db.trashNote(id);
        const results = await db.getNotesByCourse(courseId);
        expect(results).toHaveLength(0);
    });
});

// ── Trash / restore / purge ───────────────────────────────────────────────────

describe('trash, restore, purge', () => {
    test('trashed notes appear in getTrashedNotes()', async () => {
        const db = await freshDb();
        const id = await db.addNote('Trash me', '<p></p>');
        await db.trashNote(id);
        const trashed = await db.getTrashedNotes();
        expect(trashed.map(n => n.id)).toContain(id);
        expect(trashed.find(n => n.id === id).deletedAt).toBeDefined();
    });

    test('restoreNote removes deletedAt and note reappears in getAllNotes()', async () => {
        const db = await freshDb();
        const id = await db.addNote('Restore me', '<p></p>');
        await db.trashNote(id);
        await db.restoreNote(id);
        const notes = await db.getAllNotes();
        expect(notes.map(n => n.id)).toContain(id);
        const trashed = await db.getTrashedNotes();
        expect(trashed.map(n => n.id)).not.toContain(id);
    });

    test('purgeNote removes the note permanently', async () => {
        const db = await freshDb();
        const id = await db.addNote('Purge me', '<p></p>');
        await db.trashNote(id);
        await db.purgeNote(id);
        expect(await db.getNote(id)).toBeUndefined();
        expect((await db.getTrashedNotes()).map(n => n.id)).not.toContain(id);
    });
});

// ── Course CRUD ───────────────────────────────────────────────────────────────

describe('course CRUD', () => {
    test('addCourse / getAllCourses round-trip', async () => {
        const db = await freshDb();
        await db.addCourse('Physics');
        const courses = await db.getAllCourses();
        expect(courses.some(c => c.name === 'Physics')).toBe(true);
    });

    test('renameCourse updates the name', async () => {
        const db = await freshDb();
        const id = await db.addCourse('Old Name');
        await db.renameCourse(id, 'New Name');
        const courses = await db.getAllCourses();
        expect(courses.find(c => c.id === id).name).toBe('New Name');
    });

    test('deleteCourse reassigns notes to null courseId, not deletes them', async () => {
        const db = await freshDb();
        const courseId = await db.addCourse('Chemistry');
        const noteId = await db.addNote('Chem note', '<p></p>');
        await db.updateNote(noteId, { courseId });
        await db.deleteCourse(courseId);
        const note = await db.getNote(noteId);
        expect(note).toBeDefined();
        expect(note.courseId).toBeNull();
        const courses = await db.getAllCourses();
        expect(courses.map(c => c.id)).not.toContain(courseId);
    });
});

// ── searchNotes ───────────────────────────────────────────────────────────────

describe('searchNotes', () => {
    test('finds notes by title substring', async () => {
        const db = await freshDb();
        const id = await db.addNote('Photosynthesis overview', '<p></p>');
        const results = await db.searchNotes('photosynthesis');
        expect(results.map(n => n.id)).toContain(id);
    });

    test('finds notes by rawContent substring', async () => {
        const db = await freshDb();
        const id = await db.addNote('Biology', '<p>mitochondria is the powerhouse</p>');
        const results = await db.searchNotes('powerhouse');
        expect(results.map(n => n.id)).toContain(id);
    });

    test('does not return trashed notes', async () => {
        const db = await freshDb();
        const id = await db.addNote('Trashed biology', '<p>chloroplast</p>');
        await db.trashNote(id);
        const results = await db.searchNotes('chloroplast');
        expect(results.map(n => n.id)).not.toContain(id);
    });

    test('returns empty array for an empty query', async () => {
        const db = await freshDb();
        await db.addNote('Something', '<p></p>');
        expect(await db.searchNotes('')).toEqual([]);
    });
});
