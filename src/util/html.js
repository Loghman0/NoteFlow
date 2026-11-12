/**
 * html.js — Small HTML utility helpers.
 *
 * Kept separate so both view modules and the DB layer can import without
 * creating circular dependencies.
 */

/**
 * Safely escape a string for use in HTML attribute values or text nodes.
 * Uses the DOM's own TextNode → innerHTML path, which guarantees correctness
 * across all modern engines without a dependency on a sanitization library.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Strip all HTML tags from a string, returning plain text.
 * Intended only for search/snippet purposes — never for rendering.
 *
 * @param {string} html
 * @returns {string}
 */
export function stripHtml(html) {
    return String(html).replace(/<[^>]*>/g, ' ');
}
