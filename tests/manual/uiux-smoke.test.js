/**
 * @jest-environment jsdom
 */
import 'fake-indexeddb/auto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import v8 from 'v8';

// jsdom's test environment here doesn't provide structuredClone; polyfill
// with a JSON-safe equivalent purely for this smoke test's IndexedDB writes.
if (typeof global.structuredClone !== 'function') {
    global.structuredClone = obj => v8.deserialize(v8.serialize(obj));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');

test('app boots, renders, and core interactions work after the UI/UX rewrite', async () => {
    document.documentElement.innerHTML = html.split('<body>')[1].split('</body>')[0];

    // jsdom doesn't implement innerText — stub it so getPlainText() works
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
        get() { return this.textContent; },
        configurable: true
    });

    global.confirm = () => true;
    global.alert = () => {};

    await import('../../src/main.js');
    // boot() runs on DOMContentLoaded; jsdom fires it automatically once the
    // document is parsed, but since we set innerHTML manually, dispatch it.
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));

    await new Promise(r => setTimeout(r, 300));

    // ── Boot sanity ──────────────────────────────────────────────────────────
    expect(document.getElementById('notes-list').children.length).toBeGreaterThan(0);
    expect(document.getElementById('startup-error')).toBeNull();

    // ── Icons present, no emoji-as-icon left in interactive controls ────────
    const newNoteBtn = document.getElementById('btn-new-note');
    expect(newNoteBtn.querySelector('svg')).not.toBeNull();
    const trashBtn = document.getElementById('btn-trash');
    expect(trashBtn.querySelector('svg')).not.toBeNull();
    expect(trashBtn.textContent).not.toMatch(/🗑/);
    const cleanBtn = document.getElementById('btn-clean-notes');
    expect(cleanBtn.textContent).not.toMatch(/✨/);
    expect(cleanBtn.querySelector('svg')).not.toBeNull();

    // ── New note ──────────────────────────────────────────────────────────
    const countBefore = document.getElementById('notes-list').children.length;
    newNoteBtn.click();
    await new Promise(r => setTimeout(r, 50));
    expect(document.getElementById('notes-list').children.length).toBe(countBefore + 1);

    // ── Add course via popover (not window.prompt) ──────────────────────────
    const addCourseBtn = document.getElementById('btn-add-course');
    addCourseBtn.click();
    await new Promise(r => setTimeout(r, 20));
    const popover = document.querySelector('.popover');
    expect(popover).not.toBeNull();
    const input = popover.querySelector('input');
    input.value = 'Test Course';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const confirmBtn = popover.querySelector('.popover-actions button.primary');
    confirmBtn.click();
    await new Promise(r => setTimeout(r, 50));
    expect(document.getElementById('course-list').textContent).toMatch(/Test Course/);
    expect(document.querySelector('.popover')).toBeNull(); // closed after confirm

    // ── Delete note shows a toast (not a blocking confirm) ──────────────────
    document.getElementById('note-title').value = 'Smoke Test Note';
    document.getElementById('note-title').dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 700)); // metadata debounce

    document.getElementById('btn-delete-note').click();
    await new Promise(r => setTimeout(r, 80));
    const toasts = document.querySelectorAll('.toast');
    const deleteToast = Array.from(toasts).find(t => /moved to trash/i.test(t.textContent));
    expect(deleteToast).toBeDefined();
    expect(deleteToast.querySelector('.toast-action')).not.toBeNull(); // Undo button

    // ── Trash panel opens as slide-over, not a static modal ────────────────
    document.getElementById('btn-trash').click();
    await new Promise(r => setTimeout(r, 20));
    const trashPanel = document.getElementById('trash-panel');
    expect(trashPanel.classList.contains('hidden')).toBe(false);
    expect(trashPanel.querySelector('.trash-item')).not.toBeNull();

    // ── Mobile sidebar toggle exists and toggles ────────────────────────────
    const sidebarToggle = document.getElementById('btn-sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    expect(sidebar.classList.contains('open')).toBe(false);
    sidebarToggle.click();
    expect(sidebar.classList.contains('open')).toBe(true);
}, 15000);
