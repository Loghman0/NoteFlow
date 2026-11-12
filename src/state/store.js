/**
 * store.js — Single source of truth for UI state.
 *
 * A minimal observable store: callers subscribe to named events and the store
 * emits them whenever the corresponding slice of state changes. No framework,
 * no Proxy magic — just a plain object with explicit setters and a tiny
 * publish/subscribe bus. This is the "state layer" called for by Phase 3
 * (A1/A4) of the improvement plan.
 *
 * Why explicit setters instead of a Proxy? Setters are predictable, easy to
 * test, and don't require a polyfill or special runtime; the added verbosity
 * is a worthwhile tradeoff for a codebase that deliberately has zero
 * dependencies and no build step.
 */

class Store {
    constructor() {
        // ── state ────────────────────────────────────────────────────────────────
        this._currentNoteId = null;
        this._currentView = 'raw';      // 'raw' | 'clean'
        this._selectedCourseId = null;
        this._saveStatus = '';         // '' | 'Saving…' | 'Saved' | 'Save failed'
        this._isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

        // ── subscribers ──────────────────────────────────────────────────────────
        // Map<eventName, Set<callback>>
        this._subs = new Map();
    }

    // ── pub/sub ─────────────────────────────────────────────────────────────────

    /**
     * Subscribe to a named event. Returns an unsubscribe function.
     * @param {string} event
     * @param {Function} cb
     * @returns {() => void}
     */
    on(event, cb) {
        if (!this._subs.has(event)) this._subs.set(event, new Set());
        this._subs.get(event).add(cb);
        return () => this._subs.get(event)?.delete(cb);
    }

    /** @param {string} event  @param {*} payload */
    emit(event, payload) {
        this._subs.get(event)?.forEach(cb => cb(payload));
    }

    // ── currentNoteId ────────────────────────────────────────────────────────────

    get currentNoteId() { return this._currentNoteId; }

    setCurrentNoteId(id) {
        if (this._currentNoteId === id) return;
        this._currentNoteId = id;
        this.emit('noteChanged', id);
    }

    // ── currentView ──────────────────────────────────────────────────────────────

    get currentView() { return this._currentView; }

    setCurrentView(view) {
        if (this._currentView === view) return;
        this._currentView = view;
        this.emit('viewChanged', view);
    }

    // ── selectedCourseId ────────────────────────────────────────────────────────

    get selectedCourseId() { return this._selectedCourseId; }

    setSelectedCourseId(id) {
        // Allow toggling (click the active course to deselect)
        const next = this._selectedCourseId === id ? null : id;
        this._selectedCourseId = next;
        this.emit('courseFilterChanged', next);
    }

    // ── saveStatus ───────────────────────────────────────────────────────────────

    get saveStatus() { return this._saveStatus; }

    setSaveStatus(status) {
        this._saveStatus = status;
        this.emit('saveStatusChanged', status);
    }

    // ── online / offline ────────────────────────────────────────────────────────

    get isOnline() { return this._isOnline; }

    setOnline(online) {
        if (this._isOnline === online) return;
        this._isOnline = online;
        this.emit('onlineChanged', online);
    }
}

export { Store };
export const store = new Store();

