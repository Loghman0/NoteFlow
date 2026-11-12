/**
 * courses.js — Course use-cases (Phase 3, A1).
 *
 * All course-related business logic: listing, adding, renaming, and deleting
 * courses. Deleting a course reassigns its notes to "No Course" rather than
 * destroying them — that invariant is enforced here (via the DB layer) and
 * does not need to be repeated in the view.
 */

import { db } from '../utils/database.js';
import { store } from '../state/store.js';

/**
 * Return all courses, sorted by name.
 * @returns {Promise<Array<{id: number, name: string, createdAt: string}>>}
 */
export async function listCourses() {
    const courses = await db.getAllCourses();
    return courses.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Create a new course with the given name.
 * @param {string} name
 * @returns {Promise<number>} The new course's id.
 */
export async function addCourse(name) {
    return db.addCourse(name.trim());
}

/**
 * Rename a course. No-op if the new name is the same as the current one.
 * @param {number} id
 * @param {string} newName
 * @returns {Promise<void>}
 */
export async function renameCourse(id, newName) {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await db.renameCourse(id, trimmed);
}

/**
 * Delete a course and reassign its notes to "No Course" (courseId → null).
 * If the deleted course was the currently-selected filter, the filter is
 * cleared so the sidebar shows all notes instead of an empty, broken filter.
 *
 * @param {number} id
 * @returns {Promise<void>}
 */
export async function deleteCourse(id) {
    if (store.selectedCourseId === id) {
        // Use the store's internal setter so any subscribed view is notified
        store._selectedCourseId = null;
        store.emit('courseFilterChanged', null);
    }
    await db.deleteCourse(id);
}

/**
 * Toggle the sticky course filter. Clicking the active course deselects it.
 * The store's setSelectedCourseId already handles the toggle logic.
 * @param {number} courseId
 */
export function setCourseFilter(courseId) {
    store.setSelectedCourseId(courseId);
}
