# Table of contents

1. Selector table
2. Generated classes
3. Rules

## Selector table

| Document element | Emitted HTML                     | Notes                                                                                                                                                                                                                                                                                            |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page title       | `<h1>`                           | Exactly one per document. Taken from the document's own title if it has one; otherwise derived from the content and confirmed with the user.                                                                                                                                                     |
| Section heading  | `<h2>`–`<h4>`                    | Never skip a level. A document with no headings emits none — do not invent structure that isn't in the source.                                                                                                                                                                                   |
| Body paragraph   | `<p>`                            | One `<p>` per source paragraph. Never merge or split.                                                                                                                                                                                                                                            |
| Bulleted list    | `<ul><li>`                       | Nested lists nest `<ul>` inside the parent `<li>`, not as a sibling.                                                                                                                                                                                                                             |
| Numbered list    | `<ol><li>`                       | Only when the source is genuinely ordered. Do not convert bullets to numbers for tidiness.                                                                                                                                                                                                       |
| Code block       | `<pre><code class="language-x">` | `language-x` is the only generated class name. Omit the class entirely if the language is unknown — never guess.                                                                                                                                                                                 |
| Inline code      | `<code>`                         | No wrapping `<pre>`.                                                                                                                                                                                                                                                                             |
| Link             | `<a href>`                       | Bare URLs in the source become links with the URL as the text. Never rewrite link text.                                                                                                                                                                                                          |
| Table            | `<table><thead><tbody>`          | A header row always goes in `<thead>`; every other row in `<tbody>`. Column alignment is NOT preserved — it would require an inline `style`. No `colspan` or `rowspan`; a source table that needs them is emitted as-is and flagged to the user.                                                 |
| Table cell       | `<th>` / `<td>`                  | `<th>` only inside `<thead>`. Row-label cells in `<tbody>` are `<td>`.                                                                                                                                                                                                                           |
| Block quote      | `<blockquote>`                   | Content is wrapped in `<p>`, same as body text. An attribution line stays inside the `<blockquote>` as its final `<p>`, prefixed `—`.                                                                                                                                                            |
| Image            | `<figure><img><figcaption>`      | `alt` is REQUIRED; if the source gives none, ask rather than emitting an empty one. Omit `<figcaption>` when there is no caption — never emit it empty. If the source references an image the renderer has no file for, emit nothing and report it; do not link to a path that will not resolve. |
| Bold             | `<strong>`                       | Only where the source is already emphasised. Never add emphasis for readability — that is an edit, and edits happen in Step 3.                                                                                                                                                                   |
| Italic           | `<em>`                           | As above. Do not use `<i>` or `<b>`.                                                                                                                                                                                                                                                             |
| Horizontal rule  | `<hr>`                           | Only when the source has one. Do not insert rules between sections — headings already carry that job.                                                                                                                                                                                            |
| Callout          | `<div class="callout">`          | Contains one or more `<p>`. A leading label ("Note", "Warning") is the first child `<strong>` of the first `<p>`. See the class list below.                                                                                                                                                      |

## Generated classes

These are the ONLY class names the renderer emits. Style these and semantic tags; nothing else will appear.

| Class     | Applied to                             | Why a tag won't do                                                                                                                   |
| --------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `page`    | The outer `<div>` wrapping all content | Gives the stylesheet a single hook for page width, margins and print rules. No tag expresses "the document body as a styled column". |
| `callout` | `<div class="callout">`                | HTML has no element for an aside-with-emphasis. `<aside>` means tangential content, which is a different thing.                      |

## Rules

1. NEVER emit a class, id, inline `style` attribute, or `<style>` block that does not appear in this file. If a document element has no row in the selector table, emit the nearest semantic tag with no class.
2. Do not invent a selector at render time.
