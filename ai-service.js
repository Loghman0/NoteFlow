// AI transformation service for "Clean this up" feature
const AI_API_URL = 'https://api.perplexity.ai/chat/completions'; // Placeholder - replace with actual API

export class AIService {
  constructor(apiKey = null) {
    this.apiKey = apiKey;
  }

  setApiKey(key) {
    this.apiKey = key;
  }

  async cleanNotes(rawNotes) {
    // Track usage
    if (window.db) {
      await window.db.trackUsage('ai_transformation');
    }

    const systemPrompt = `You are helping a student turn their raw, in-the-moment lesson notes into
clean, study-ready notes. You will be given raw notes exactly as the
student typed them during class — expect fragments, abbreviations,
inconsistent formatting, and possible typos.

Your job:
1. Detect the language the notes are written in. Respond in that same language.
2. Reorganize the content into a clear structure (headings for topics,
   bullet points for details) WITHOUT inventing information that
   wasn't in the original notes.
3. Identify and mark the 5-10 most important terms or concepts as key terms.
4. Write a 2-4 sentence summary of what the lesson covered, based only
   on what's in the notes.
5. Preserve the student's own phrasing and wording wherever possible —
   do not rewrite everything in a generic voice. These are their notes,
   not a textbook.
6. If the notes are too sparse or unclear to structure meaningfully,
   say so plainly rather than fabricating structure or content.

Never add facts, dates, or claims that are not present in the original
notes. If something is ambiguous, preserve the ambiguity rather than
guessing.

Output format (use markdown):
# [Title based on content]

## Summary
[2-4 sentence summary]

## Key Terms
- **term1**: brief explanation
- **term2**: brief explanation
- ...

## Structured Notes
[Well-organized notes with headings and bullet points, preserving original wording]`;

    const response = await fetch(AI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Here are my raw lecture notes:

${rawNotes}` }
        ],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  // For missed-class mode: process external text/slides
  async processExternalText(text, sourceType = 'text') {
    return await this.cleanNotes(text);
  }
}

export const aiService = new AIService();
