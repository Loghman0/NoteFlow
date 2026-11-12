# StudyNotes AI - AI-Powered Student Notes App

An AI-powered notes app designed specifically for students, focused on transforming messy lecture notes into clean, study-ready notes.

## Core Features

- **Rich Text Editor**: Bold, italic, underline, headings, lists, code blocks, and highlighting
- **AI Clean-Up**: Transform raw notes into structured outlines with key terms and summaries
- **Local-First**: All data stored locally in IndexedDB - works offline
- **PWA**: Installable, works offline, no account required
- **Export**: One-click export all notes as Markdown

## Getting Started

1. Serve the project with a local static server (required for the service worker and ES modules — see "Development" below; opening `index.html` directly via `file://` will not work).
2. Create a course and start taking notes.
3. Click "Clean this up" to transform your notes with AI.

## Architecture

- **Frontend**: Vanilla JavaScript (no framework dependencies)
- **Storage**: IndexedDB for local-first data persistence
- **AI**: API-based transformation (bring your own API key)
- **PWA**: Service worker for offline support

## File Structure

This now matches the project's actual, real layout (previous revisions of this README described a structure the code didn't actually use, which was the root cause of several path-related bugs — see `noteflow-fix-notes.md`):

```
noteflow/
├── index.html
├── manifest.json
├── favicon.svg
├── sw.js                    # kept at the root so its offline cache can cover the whole site
├── src/
│   ├── main.js               # Main application controller
│   ├── components/
│   │   └── editor.js         # Rich text editor
│   ├── utils/
│   │   ├── database.js       # IndexedDB wrapper
│   │   └── ai-service.js     # AI transformation service
│   ├── util/
│   │   └── safe-markdown.js  # Safe (non-innerHTML) Markdown renderer for AI output
│   └── styles/
│       └── main.css          # Main stylesheet
└── README.md
```

## Development

To test locally:
```bash
# Serve the app with a local server (required for ES modules + the service worker)
python -m http.server 8000
# or
npx serve .
```

Then open http://localhost:8000 in your browser.

## AI Integration

The app uses an AI API for the "Clean this up" feature. You'll need to provide your own API key when prompted. The app currently uses a placeholder URL (`src/utils/ai-service.js`) that should be replaced with your preferred AI service endpoint. Note that many providers block calls made directly from a browser with a personal API key (CORS) — see the "Still open" list below.

## Status of this revision

A full audit and a first implementation pass have been done (see `noteflow-fix-notes.md` for the complete list). In short:

**Fixed:** the app previously failed to load at all (a syntax error plus every file path pointing at a folder structure that didn't exist), the AI "clean notes" view was vulnerable to XSS via unsanitized AI output, the highlighter toolbar buttons silently did nothing, and there were two data-race bugs that could lose or misplace note content. A later pass added retry/recovery for local-storage startup failures, offline gating on the AI button, a Content-Security-Policy header, and core missing features: search across notes, a trash with restore/permanent-delete, and course rename/delete (deleting a course reassigns its notes to "No Course" rather than deleting them).

**Still open** (see `noteflow-fix-notes.md`'s "Not done yet" section): the app controller is still a single large file rather than split into view/state/use-case layers; the AI API key is still sent directly from the browser rather than through a backend proxy; there are still no automated tests or CI; and the PWA manifest only has one SVG icon rather than the PNG set most install-prompt heuristics expect.

## Next Steps (v2+)

- Live audio recording + transcription
- Flashcard/quiz generation
- Shared/collaborative notes
- Native mobile apps
- Account-based sync

## License

MIT License
