/**
 * popover.js — Small anchored popover for single-field text input.
 *
 * Replaces window.prompt() call sites (course name, course rename, AI API
 * key) with an inline popover anchored to the button that triggered it.
 * Deliberately minimal: one field, a hint line, Cancel/Confirm. A
 * transparent backdrop closes it on outside click; Escape also closes it.
 *
 * Not a general-purpose dialog system — for anything heavier than "collect
 * one short value near where the person clicked," a dedicated view/panel
 * (like the trash side panel) is more appropriate than stretching this.
 */

let _activePopover = null;

/**
 * @param {HTMLElement} anchorEl - element the popover is positioned below
 * @param {{
 *   title: string,
 *   hint?: string,
 *   placeholder?: string,
 *   initialValue?: string,
 *   confirmLabel?: string,
 *   confirmVariant?: 'primary'|'danger',
 *   inputType?: string,
 *   onConfirm: (value: string) => void | Promise<void>
 * }} opts
 */
export function openInputPopover(anchorEl, opts) {
    closeActivePopover();

    const {
        title,
        hint = '',
        placeholder = '',
        initialValue = '',
        confirmLabel = 'Save',
        confirmVariant = 'primary',
        inputType = 'text',
        onConfirm
    } = opts;

    const backdrop = document.createElement('div');
    backdrop.className = 'popover-backdrop';

    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', title);

    const titleEl = document.createElement('div');
    titleEl.className = 'popover-title';
    titleEl.textContent = title;
    pop.appendChild(titleEl);

    if (hint) {
        const hintEl = document.createElement('div');
        hintEl.className = 'popover-hint';
        hintEl.textContent = hint;
        pop.appendChild(hintEl);
    }

    const input = document.createElement('input');
    input.type = inputType;
    input.placeholder = placeholder;
    input.value = initialValue;
    pop.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'popover-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', close);
    actions.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = confirmVariant;
    confirmBtn.textContent = confirmLabel;
    const submit = async () => {
        const value = input.value.trim();
        if (!value) { input.focus(); return; }
        close();
        await onConfirm(value);
    };
    confirmBtn.addEventListener('click', submit);
    actions.appendChild(confirmBtn);

    pop.appendChild(actions);

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') close();
    });

    backdrop.addEventListener('click', close);

    document.getElementById('popover-root').appendChild(backdrop);
    document.getElementById('popover-root').appendChild(pop);

    positionNear(pop, anchorEl);

    requestAnimationFrame(() => input.focus());

    function close() {
        backdrop.remove();
        pop.remove();
        if (_activePopover === handle) _activePopover = null;
    }

    const handle = { close };
    _activePopover = handle;
    return handle;
}

export function closeActivePopover() {
    if (_activePopover) {
        _activePopover.close();
        _activePopover = null;
    }
}

function positionNear(pop, anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const popWidth = 300; // matches .popover CSS width
    let left = rect.left;
    let top = rect.bottom + 8;

    // Keep the popover on-screen horizontally
    if (left + popWidth > window.innerWidth - 12) {
        left = window.innerWidth - popWidth - 12;
    }
    if (left < 12) left = 12;

    // If there isn't room below, place it above the anchor instead
    const estimatedHeight = 160;
    if (top + estimatedHeight > window.innerHeight - 12) {
        top = rect.top - estimatedHeight - 8;
    }

    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(12, top)}px`;
}
