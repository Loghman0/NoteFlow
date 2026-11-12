// IndexedDB wrapper for local-first storage
const DB_NAME = 'StudyNotesDB';
const DB_VERSION = 1;

export class Database {
  /**
   * @param {string} [name] — Custom DB name; useful in tests to create
   *   isolated instances. Defaults to the production name.
   */
  constructor(name = DB_NAME) {
    this.dbName = name;
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Create courses store
        if (!db.objectStoreNames.contains('courses')) {
          const courseStore = db.createObjectStore('courses', { keyPath: 'id', autoIncrement: true });
          courseStore.createIndex('name', 'name', { unique: false });
        }

        // Create notes store
        if (!db.objectStoreNames.contains('notes')) {
          const noteStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
          noteStore.createIndex('courseId', 'courseId', { unique: false });
          noteStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // S3: the 'usage' store was a write-only, never-read tracking table with
        // no user-visible purpose. Per the improvement plan it should be removed
        // until it's wired to a real UI. New installs don't create it; existing
        // DBs have it but it's harmlessly inert.
      };
    });
  }

  // Courses
  async addCourse(name) {
    const transaction = this.db.transaction(['courses'], 'readwrite');
    const store = transaction.objectStore('courses');
    return new Promise((resolve, reject) => {
      const request = store.add({ name, createdAt: new Date().toISOString() });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getAllCourses() {
    const transaction = this.db.transaction(['courses'], 'readonly');
    const store = transaction.objectStore('courses');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Phase 9: course rename. Single-field update via the same get+put
  // pattern used by updateNote() - courses have no concurrent-writer risk
  // today (only the "Add course" flow writes to this store), but keeping
  // it inside one transaction avoids introducing a new pattern.
  async renameCourse(id, name) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['courses'], 'readwrite');
      const store = transaction.objectStore('courses');
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const course = getRequest.result;
        if (!course) {
          reject(new Error('Course not found'));
          return;
        }
        course.name = name;
        const putRequest = store.put(course);
        putRequest.onsuccess = () => resolve(putRequest.result);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Phase 9: course delete. Notes that belonged to the deleted course are
  // reassigned to "No Course" (courseId = null) rather than deleted, so
  // deleting a course never destroys note content.
  async deleteCourse(id) {
    const notesInCourse = await this.getNotesByCourse(id);
    for (const note of notesInCourse) {
      await this.updateNote(note.id, { courseId: null });
    }
    const transaction = this.db.transaction(['courses'], 'readwrite');
    const store = transaction.objectStore('courses');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Notes
  async addNote(title, content, courseId = null) {
    const transaction = this.db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');
    const note = {
      title,
      rawContent: content,
      cleanContent: null,
      courseId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return new Promise((resolve, reject) => {
      const request = store.add(note);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // FIX (B5): the previous implementation read the note in one transaction
  // (getNote), merged in JS, then wrote it back in a second, separate
  // transaction (put). Two concurrent callers (e.g. a title-metadata save
  // firing while a debounced content autosave is also in flight) could each
  // read the same pre-update note and then each write back a version that is
  // missing the other's change - a classic lost-update race.
  //
  // Fix: perform the read (get) and the write (put) inside a single
  // IndexedDB transaction. IndexedDB serializes readwrite transactions
  // against the same object store, so a second updateNote() call cannot
  // start its own get() until this transaction (get+put) has fully
  // committed - which removes the race window entirely.
  async updateNote(id, updates) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['notes'], 'readwrite');
      const store = transaction.objectStore('notes');

      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const note = getRequest.result;
        if (!note) {
          reject(new Error('Note not found'));
          return;
        }

        const updatedNote = {
          ...note,
          ...updates,
          updatedAt: new Date().toISOString()
        };

        const putRequest = store.put(updatedNote);
        putRequest.onsuccess = () => resolve(putRequest.result);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async getNote(id) {
    const transaction = this.db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // FIX (Phase 9, trash): getAllNotes() now excludes soft-deleted notes
  // (deletedAt set) so trashed notes stop appearing in the normal sidebar
  // list. Older notes created before this field existed simply have
  // deletedAt === undefined, which is falsy and treated as "not deleted".
  async getAllNotes() {
    const transaction = this.db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result || []).filter(n => !n.deletedAt));
      request.onerror = () => reject(request.error);
    });
  }

  // Phase 4 (P2): Load only the fields needed for the sidebar list — title,
  // updatedAt, courseId — instead of pulling the full rawContent and
  // cleanContent blobs into memory for every note just to show a title and
  // date. At small note counts the difference is invisible; at hundreds of
  // large lecture-note documents it avoids pulling megabytes of HTML into
  // memory on every sidebar refresh.
  //
  // `hasCleanContent` is included as a lightweight boolean so the sidebar
  // can still show an indicator without fetching the full content.
  async getNoteSummaries() {
    const transaction = this.db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const summaries = [];
      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) { resolve(summaries); return; }
        const { id, title, updatedAt, courseId, deletedAt, cleanContent } = cursor.value;
        if (!deletedAt) {
          summaries.push({
            id, title, updatedAt, courseId,
            hasCleanContent: !!cleanContent
          });
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  // Phase 9: trash. Notes in the trash are retrievable via getTrashedNotes()
  // and can be restored or permanently purged. A note in the trash is
  // simply marked with deletedAt rather than removed, so "Delete" becomes
  // recoverable instead of the previous single confirm()-gated permanent
  // delete.
  async getTrashedNotes() {
    const transaction = this.db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve((request.result || []).filter(n => !!n.deletedAt));
      request.onerror = () => reject(request.error);
    });
  }

  async trashNote(id) {
    return this.updateNote(id, { deletedAt: new Date().toISOString() });
  }

  async restoreNote(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['notes'], 'readwrite');
      const store = transaction.objectStore('notes');
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const note = getRequest.result;
        if (!note) {
          reject(new Error('Note not found'));
          return;
        }
        delete note.deletedAt;
        note.updatedAt = new Date().toISOString();
        const putRequest = store.put(note);
        putRequest.onsuccess = () => resolve(putRequest.result);
        putRequest.onerror = () => reject(putRequest.error);
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  // Permanent delete - only reachable from the trash view.
  async purgeNote(id) {
    return this.deleteNote(id);
  }

  // Phase 9: search across notes (title + rawContent + cleanContent).
  // Loads all non-trashed notes and filters in memory - fine at the note
  // counts this app targets today; a proper text index (per the plan's
  // Phase 4 performance work) would be the next step if the note count
  // grows large enough to make this noticeably slow.
  async searchNotes(query) {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const notes = await this.getAllNotes();
    return notes.filter(note => {
      const haystack = [
        note.title || '',
        this.stripHtml(note.rawContent || ''),
        note.cleanContent || ''
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  // Strips HTML tags for search purposes only (never used for rendering).
  stripHtml(html) {
    return String(html).replace(/<[^>]*>/g, ' ');
  }

  // FIX (P3): previously this loaded every note via getAllNotes() and
  // filtered in JS, ignoring the existing 'courseId' index entirely -
  // O(total notes) work for what should be an indexed lookup. Now uses
  // IDBKeyRange against the courseId index directly.
  async getNotesByCourse(courseId) {
    const transaction = this.db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    const index = store.index('courseId');
    return new Promise((resolve, reject) => {
      const request = index.getAll(IDBKeyRange.only(courseId));
      request.onsuccess = () => resolve((request.result || []).filter(n => !n.deletedAt));
      request.onerror = () => reject(request.error);
    });
  }

  // Permanent, unrecoverable delete. Only called by purgeNote() (trash) and
  // internally by deleteCourse()'s reassignment path never calls this.
  async deleteNote(id) {
    const transaction = this.db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }


  // Export all notes as Markdown
  async exportAllNotes() {
    const notes = await this.getAllNotes();
    let markdown = '# StudyNotes Export\n\n';
    markdown += `Exported: ${new Date().toISOString()}\n\n`;
    markdown += '---\n\n';

    for (const note of notes) {
      markdown += `## ${note.title}\n\n`;
      markdown += `Created: ${note.createdAt}\n`;
      markdown += `Updated: ${note.updatedAt}\n\n`;
      markdown += `### Raw Notes\n\n${note.rawContent}\n\n`;

      if (note.cleanContent) {
        markdown += `### Clean Notes\n\n${note.cleanContent}\n\n`;
      }

      markdown += '---\n\n';
    }

    return markdown;
  }
}

export const db = new Database();
