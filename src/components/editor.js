// Rich text editor component with highlighting support
export class Editor {
  constructor(editorElement, toolbarElement) {
    this.editor = editorElement;
    this.toolbar = toolbarElement;
    this.saveTimeoutId = null;
    this.setupToolbar();
    this.setupAutosave();
  }

  setupToolbar() {
    const buttons = this.toolbar.querySelectorAll('.toolbar-btn');

    buttons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.dataset.command;
        const value = btn.dataset.value || null;

        if (command === 'highlight') {
          this.applyHighlight(btn.dataset.color);
        } else {
          document.execCommand(command, false, value);
        }

        this.editor.focus();
      });
    });
  }

  applyHighlight(color) {
    document.execCommand('hiliteColor', false, color);
  }

  setupAutosave() {
    this.editor.addEventListener('input', () => {
      if (this.saveTimeoutId) clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = setTimeout(() => {
        this.saveTimeoutId = null;
        this.triggerAutosave();
      }, 1000); // Autosave after 1 second of inactivity
    });
  }

  // FIX (B4): previously nothing cancelled or flushed a pending debounced
  // autosave when the caller switched to a different note. Because the
  // debounce timer read this.editor.innerHTML lazily (at fire time, not at
  // keystroke time), a pending save could fire *after* the DOM had already
  // been repointed at a different note's content, or could race the app's
  // currentNoteId being reassigned - either way risking content being lost
  // or written to the wrong note.
  //
  // The fix is to have the caller (main.js) call flushPendingAutosave()
  // synchronously *before* it swaps the editor's content or currentNoteId
  // for a different note. Because this runs synchronously (no setTimeout),
  // it fires while the editor DOM and currentNoteId still belong to the
  // note being left, guaranteeing the last edit is saved to the right note
  // before anything else changes.
  flushPendingAutosave() {
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
      this.saveTimeoutId = null;
      this.triggerAutosave();
    }
  }

  triggerAutosave() {
    // Event will be handled by main app
    const event = new CustomEvent('editor-change', {
      detail: { content: this.editor.innerHTML }
    });
    this.editor.dispatchEvent(event);
  }

  getContent() {
    return this.editor.innerHTML;
  }

  setContent(html) {
    this.editor.innerHTML = html;
  }

  getPlainText() {
    return this.editor.innerText;
  }

  clear() {
    this.editor.innerHTML = '<p>Start typing your notes here...</p>';
  }
}
