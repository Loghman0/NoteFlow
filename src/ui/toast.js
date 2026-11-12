/**
 * toast.js — Lightweight toast notifications.
 *
 * Replaces window.alert() calls with a non-blocking, auto-dismissing toast
 * that appears above the editor. Supports an optional action button (used
 * for "Undo" after moving a note to the trash) so a destructive-feeling
 * action doesn't need a blocking confirm() dialog up front — the person can
 * act, then undo within a few seconds if it was a mistake.
 *
 * Kept intentionally framework-free and dependency-free, consistent with
 * the rest of the app.
 */

const ICONS = {
    success: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 5.2v3.6M8 11h.01"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7.3v3.6M8 5h.01"/></svg>'
};

/**
 * Show a toast.
 * @param {string} message
 * @param {{
 *   type?: 'success'|'error'|'info',
 *   duration?: number,
 *   actionLabel?: string,
 *   onAction?: () => void
 * }} [opts]
 */
export function showToast(message, opts = {}) {
    const { type = 'info', duration = 5000, actionLabel, onAction } = opts;
    const region = document.getElementById('toast-region');
    if (!region) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.innerHTML = ICONS[type] || ICONS.info;
    toast.appendChild(icon);

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;
    toast.appendChild(msg);

    let dismissed = false;
    const remove = () => {
        if (dismissed) return;
        dismissed = true;
        toast.classList.add('leaving');
        setTimeout(() => toast.remove(), 200);
    };

    if (actionLabel && typeof onAction === 'function') {
        const actionBtn = document.createElement('button');
        actionBtn.className = 'toast-action';
        actionBtn.textContent = actionLabel;
        actionBtn.addEventListener('click', () => {
            remove();
            onAction();
        });
        toast.appendChild(actionBtn);
    }

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'toast-dismiss';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    dismissBtn.addEventListener('click', remove);
    toast.appendChild(dismissBtn);

    region.appendChild(toast);

    if (duration > 0) {
        setTimeout(remove, duration);
    }

    return { dismiss: remove };
}
