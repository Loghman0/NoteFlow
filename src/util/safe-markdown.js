// Safe renderer for the constrained Markdown subset the AI "clean this up"
// feature is prompted to return (# / ## / ### headings, **bold**, "- "/"* "
// bullet lists, and blank-line-separated paragraphs).
//
// WHY THIS FILE EXISTS (fixes B1 and B7 from the improvement plan):
//
// The previous implementation (main.js's markdownToHtml()) built an HTML
// *string* with chained .replace() calls and then assigned it directly to
// an element's innerHTML. Two problems followed from that:
//
//   1. One of those replace() calls contained a raw, unescaped newline
//      inside a regex literal instead of the escape sequence "\n\n". A
//      literal line break inside a /.../ regex is a JavaScript
//      SyntaxError ("Invalid regular expression: missing /"), which broke
//      *module parsing* for the entire app - nothing loaded at all.
//
//   2. Even with that syntax fixed, cleanContent comes from an AI API
//      response. That text is derived from the student's own raw notes,
//      which are attacker-controllable input to the AI prompt. If a
//      malicious or unusual payload in those notes ever caused the model
//      to echo back HTML/script markup (a realistic prompt-injection
//      outcome), assigning that text to .innerHTML would let it execute
//      as live HTML/JS in the app - a stored XSS vector triggered simply
//      by pasting notes and clicking "Clean this up".
//
// This renderer avoids both problems structurally rather than patching
// around them: it never builds or parses an HTML string at all. It walks
// the Markdown text itself and constructs DOM nodes directly via
// document.createElement()/textContent, so arbitrary text can never be
// interpreted as markup - "<img src=x onerror=alert(1)>" in the source
// text renders as the literal, inert string "<img src=x onerror=alert(1)>"
// on the page, not as an executable tag.

function appendInlineFormatted(parent, text) {
  // Only inline syntax supported is **bold**. Everything else is treated
  // as literal text (never parsed as HTML).
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (!part) continue;
    const boldMatch = part.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      const strong = document.createElement('strong');
      strong.textContent = boldMatch[1];
      parent.appendChild(strong);
    } else {
      parent.appendChild(document.createTextNode(part));
    }
  }
}

/**
 * Render `markdown` into `container` safely (no innerHTML, ever).
 * Clears any existing content in `container` first.
 */
export function renderMarkdownSafely(markdown, container) {
  // Clear safely - textContent assignment does not parse markup either.
  container.textContent = '';

  const lines = String(markdown || '').split('\n');
  let i = 0;
  let currentList = null;

  const closeList = () => { currentList = null; };

  while (i < lines.length) {
    const line = lines[i];

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      const heading = document.createElement('h' + level);
      appendInlineFormatted(heading, headingMatch[2]);
      container.appendChild(heading);
      i++;
      continue;
    }

    const listMatch = line.match(/^[-*]\s+(.*)$/);
    if (listMatch) {
      if (!currentList) {
        currentList = document.createElement('ul');
        container.appendChild(currentList);
      }
      const li = document.createElement('li');
      appendInlineFormatted(li, listMatch[1]);
      currentList.appendChild(li);
      i++;
      continue;
    }

    if (line.trim() === '') {
      closeList();
      i++;
      continue;
    }

    // Paragraph: gather consecutive non-blank, non-heading, non-list lines.
    closeList();
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^[-*]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    const p = document.createElement('p');
    appendInlineFormatted(p, paraLines.join(' '));
    container.appendChild(p);
  }
}
