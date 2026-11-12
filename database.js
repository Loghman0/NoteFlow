// IndexedDB wrapper for local-first storage
const DB_NAME = 'StudyNotesDB';
const DB_VERSION = 1;

export class Database {
  constructor() {
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

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

        // Create usage tracking store
        if (!db.objectStoreNames.contains('usage')) {
          db.createObjectStore('usage', { keyPath: 'id', autoIncrement: true });
        }
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

  // Notes
  async addNote(title, content, courseId = null) {
    const transaction = this.db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');
    const note = {
      title,
      rawContent: content,
      cleanContent: null,
      courseId,
      isCleanView: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    return new Promise((resolve, reject) => {
      const request = store.add(note);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async updateNote(id, updates) {
    const note = await this.getNote(id);
    if (!note) throw new Error('Note not found');

    const updatedNote = {
      ...note,
      ...updates,
      updatedAt: new Date().toISOString()
    };

    const transaction = this.db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.put(updatedNote);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
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

  async getAllNotes() {
    const transaction = this.db.transaction(['notes'], 'readonly');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getNotesByCourse(courseId) {
    const notes = await this.getAllNotes();
    return notes.filter(note => note.courseId === courseId);
  }

  async deleteNote(id) {
    const transaction = this.db.transaction(['notes'], 'readwrite');
    const store = transaction.objectStore('notes');
    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // Usage tracking
  async trackUsage(action) {
    const transaction = this.db.transaction(['usage'], 'readwrite');
    const store = transaction.objectStore('usage');
    const usage = {
      action,
      timestamp: new Date().toISOString()
    };
    return new Promise((resolve, reject) => {
      const request = store.add(usage);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getUsageStats() {
    const transaction = this.db.transaction(['usage'], 'readonly');
    const store = transaction.objectStore('usage');
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
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
