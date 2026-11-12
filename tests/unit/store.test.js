/**
 * store.test.js — Unit tests for the observable state store.
 *
 * Phase 7: verifies that the pub/sub contract holds — each setter emits the
 * expected event with the correct payload, and the toggle logic for
 * selectedCourseId works correctly.
 */

import { Store } from '../../src/state/store.js';

// Export a fresh store factory so tests are isolated
function makeStore() {
    return new Store();
}

describe('Store pub/sub', () => {
    test('on() returns an unsubscribe function', () => {
        const s = makeStore();
        const calls = [];
        const unsub = s.on('saveStatusChanged', v => calls.push(v));
        s.setSaveStatus('Saving…');
        expect(calls).toHaveLength(1);
        unsub();
        s.setSaveStatus('Saved');
        expect(calls).toHaveLength(1); // no new call after unsubscribe
    });

    test('setSaveStatus emits saveStatusChanged', () => {
        const s = makeStore();
        const events = [];
        s.on('saveStatusChanged', v => events.push(v));
        s.setSaveStatus('Save failed');
        expect(events).toEqual(['Save failed']);
    });

    test('setCurrentNoteId emits noteChanged', () => {
        const s = makeStore();
        const events = [];
        s.on('noteChanged', v => events.push(v));
        s.setCurrentNoteId(42);
        expect(events).toEqual([42]);
    });

    test('setCurrentNoteId is a no-op if the id is unchanged', () => {
        const s = makeStore();
        const events = [];
        s.on('noteChanged', v => events.push(v));
        s.setCurrentNoteId(1);
        s.setCurrentNoteId(1); // second call, same id
        expect(events).toHaveLength(1);
    });

    test('setCurrentView emits viewChanged', () => {
        const s = makeStore();
        const events = [];
        s.on('viewChanged', v => events.push(v));
        s.setCurrentView('clean');
        expect(events).toEqual(['clean']);
    });

    test('setCurrentView is a no-op if the view is unchanged', () => {
        const s = makeStore();
        const events = [];
        s.on('viewChanged', v => events.push(v));
        s.setCurrentView('raw');         // same as initial
        expect(events).toHaveLength(0);
    });

    test('setSelectedCourseId toggles: selecting then selecting again deselects', () => {
        const s = makeStore();
        s.setSelectedCourseId(5);
        expect(s.selectedCourseId).toBe(5);
        s.setSelectedCourseId(5);        // click same course again → deselect
        expect(s.selectedCourseId).toBeNull();
    });

    test('setSelectedCourseId switching courses updates to the new id', () => {
        const s = makeStore();
        s.setSelectedCourseId(1);
        s.setSelectedCourseId(2);
        expect(s.selectedCourseId).toBe(2);
    });

    test('setOnline emits onlineChanged', () => {
        const s = makeStore();
        const events = [];
        s.on('onlineChanged', v => events.push(v));
        s.setOnline(false);
        expect(events).toEqual([false]);
    });

    test('setOnline is a no-op if online state is unchanged', () => {
        const s = makeStore();
        s.setOnline(true);               // Guarantee initial state is true
        const events = [];
        s.on('onlineChanged', v => events.push(v));
        s.setOnline(true);               // no change
        expect(events).toHaveLength(0);
    });
});
