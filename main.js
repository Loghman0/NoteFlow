import { db } from './utils/database.js';
import { aiService } from './utils/ai-service.js';
import { Editor } from './components/editor.js';

class StudyNotesApp {
  constructor() {
    this.currentNoteId = null;
    this.currentView = 'raw';
    this.editor = null;
    this.init();
  }

  async init() {
    try {
      await db.connect();
      window.db = db;

      this.setupEditor();
      this.setupEventListeners();
      await this.loadCourses();
      await this.loadNotes();
      this.registerServiceWorker();

      // Create initial note if none exists
      const notes = await db.getAllNotes();
      if (notes.length === 0) {
        await this.createNewNote();
      }
    } catch (error) {
      console.error('Failed to initialize app:', error);
      alert('Failed to initialize local storage. Please check browser settings.');
    }
  }

  setupEditor() {
    const editorElement = document.getElementById('editor');
    const toolbarElement = document.querySelector('.editor-toolbar');
    this.editor = new Editor(editorElement, toolbarElement);

    editorElement.addEventListener('editor-change', (e) => {
      this.autosave(e.detail.content);
    });
  }

  setupEventListeners() {
    document.getElementById('btn-new-note').addEventListener('click', () => this.createNewNote());
    document.getElementById('btn-add-course').addEventListener('click', () => this.addCourse());
    document.getElementById('btn-export').addEventListener('click', () => this.exportNotes());
    document.getElementById('btn-clean-notes').addEventListener('click', () => this.cleanNotes());
    document.getElementById('btn-toggle-view').addEventListener('click', () => this.toggleView());
    document.getElementById('btn-delete-note').addEventListener('click', () => this.deleteCurrentNote());

    document.getElementById('note-title').addEventListener('input', () => this.saveNoteMetadata());
    document.getElementById('note-course').addEventListener('change', () => this.saveNoteMetadata());
  }

  async createNewNote() {
    const noteId = await db.addNote('Untitled Note', '<p>Start typing your notes here...</p>');
    await this.loadNotes();
    await this.openNote(noteId);
  }

  async openNote(noteId) {
    const note = await db.getNote(noteId);
    if (!note) return;

    this.currentNoteId = noteId;
    this.currentView = 'raw';

    document.getElementById('note-title').value = note.title;
    document.getElementById('note-course').value = note.courseId || '';
    this.editor.setContent(note.rawContent);

    document.getElementById('editor').classList.remove('hidden');
    document.getElementById('clean-view').classList.add('hidden');
    document.getElementById('btn-toggle-view').textContent = note.cleanContent ? 'View Clean' : 'No Clean Version';
    document.getElementById('btn-toggle-view').disabled = !note.cleanContent;

    this.highlightActiveNote(noteId);
  }

  async autosave(content) {
    if (!this.currentNoteId || this.currentView !== 'raw') return;

    try {
      await db.updateNote(this.currentNoteId, { rawContent: content });
      this.updateSaveStatus('Saved locally');
    } catch (error) {
      console.error('Autosave failed:', error);
      this.updateSaveStatus('Save failed');
    }
  }

  async saveNoteMetadata() {
    if (!this.currentNoteId) return;

    const title = document.getElementById('note-title').value || 'Untitled Note';
    const courseId = document.getElementById('note-course').value || null;

    await db.updateNote(this.currentNoteId, { title, courseId: courseId ? Number(courseId) : null });
    await this.loadNotes();
  }

  async addCourse() {
    const name = prompt('Enter course name:');
    if (!name || !name.trim()) return;

    await db.addCourse(name.trim());
    await this.loadCourses();
  }

  async loadCourses() {
    const courses = await db.getAllCourses();
    const courseList = document.getElementById('course-list');
    const courseSelect = document.getElementById('note-course');

    courseList.innerHTML = courses.map(course => `
      <div class="course-item" data-course-id="${course.id}">${this.escapeHtml(course.name)}</div>
    `).join('');

    courseSelect.innerHTML = '<option value="">No Course</option>' + 
      courses.map(course => `<option value="${course.id}">${this.escapeHtml(course.name)}</option>`).join('');

    courseList.querySelectorAll('.course-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notes = await db.getNotesByCourse(Number(item.dataset.courseId));
        this.renderNotes(notes);
      });
    });
  }

  async loadNotes() {
    const notes = await db.getAllNotes();
    notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    this.renderNotes(notes);
  }

  renderNotes(notes) {
    const notesList = document.getElementById('notes-list');
    notesList.innerHTML = notes.map(note => `
      <div class="note-item" data-note-id="${note.id}">
        <div class="note-item-title">${this.escapeHtml(note.title)}</div>
        <div class="note-item-date">${new Date(note.updatedAt).toLocaleDateString()}</div>
      </div>
    `).join('');

    notesList.querySelectorAll('.note-item').forEach(item => {
      item.addEventListener('click', () => this.openNote(Number(item.dataset.noteId)));
    });
  }

  async cleanNotes() {
    if (!this.currentNoteId) return;

    const rawText = this.editor.getPlainText();
    if (!rawText.trim() || rawText.trim() === 'Start typing your notes here...') {
      alert('Add some notes before cleaning them up.');
      return;
    }

    const apiKey = prompt('Enter your AI API key (stored only for this session):');
    if (!apiKey) return;

    const btn = document.getElementById('btn-clean-notes');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '✨ Cleaning up...';

    try {
      aiService.setApiKey(apiKey);
      const cleanContent = await aiService.cleanNotes(rawText);

      // Preserve raw content; add clean result separately
      await db.updateNote(this.currentNoteId, { cleanContent });
      await this.openNote(this.currentNoteId);
      alert('Your clean notes are ready! Use "View Clean" to see them.');
    } catch (error) {
      console.error('AI transformation failed:', error);
      alert(`Could not clean notes: ${error.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }

  async toggleView() {
    if (!this.currentNoteId) return;
    const note = await db.getNote(this.currentNoteId);
    if (!note.cleanContent) return;

    const editor = document.getElementById('editor');
    const cleanView = document.getElementById('clean-view');
    const toggleBtn = document.getElementById('btn-toggle-view');

    if (this.currentView === 'raw') {
      this.currentView = 'clean';
      editor.classList.add('hidden');
      cleanView.classList.remove('hidden');
      document.getElementById('clean-content').innerHTML = this.markdownToHtml(note.cleanContent);
      toggleBtn.textContent = 'View Raw';
    } else {
      this.currentView = 'raw';
      editor.classList.remove('hidden');
      cleanView.classList.add('hidden');
      toggleBtn.textContent = 'View Clean';
    }
  }

  async deleteCurrentNote() {
    if (!this.currentNoteId) return;
    if (!confirm('Delete this note? This cannot be undone.')) return;

    await db.deleteNote(this.currentNoteId);
    this.currentNoteId = null;
    await this.loadNotes();
    await this.createNewNote();
  }

  async exportNotes() {
    const markdown = await db.exportAllNotes();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studynotes-export-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  updateSaveStatus(status) {
    // Could add UI indicator here
    console.log(status);
  }

  highlightActiveNote(noteId) {
    document.querySelectorAll('.note-item').forEach(item => {
      item.classList.toggle('active', Number(item.dataset.noteId) === noteId);
    });
  }

  markdownToHtml(markdown) {
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<mark>$1</mark>')
      .replace(/^[-*] (.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/

/g, '</p><p>')
      .replace(/^(?!<[h|u|l])/gm, '<p>') + '</p>';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(error => {
        console.error('Service worker registration failed:', error);
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new StudyNotesApp();
});
