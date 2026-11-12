// Rich text editor component with highlighting support
export class Editor {
  constructor(editorElement, toolbarElement) {
    this.editor = editorElement;
    this.toolbar = toolbarElement;
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
    let saveTimeout;
    this.editor.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        this.triggerAutosave();
      }, 1000); // Autosave after 1 second of inactivity
    });
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
