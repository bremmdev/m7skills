---
name: proofreading-docs
description: >-
  Proofreads text and renders it as a styled HTML documentation page. Use when the
  user pastes notes, a draft, or a document and wants it corrected, formatted, or
  turned into documentation.
---

## Workflow

Copy this checklist into your response and check items off as you work. It is your own progress
tracker, not a prompt for the user.

```
- [ ] 1. Identify the input text
- [ ] 2. Proofread and collect proposed edits
- [ ] 3. Present proposed edits and get a decision
- [ ] 4. Apply approved edits and verify
```

**Step 1: Identify the input text**

Identify the input, in this priority order:

1. File paths the user names → read those files.
2. Text pasted directly in the user's message.
3. An image → transcribe the visible text, show the transcription, and get confirmation that it
   is accurate before proofreading it.

If the user names a section rather than a whole document, the input is that section only. Leave
the rest of the document untouched.

If no input can be identified, ask for one. NEVER treat the surrounding conversation as the input
text.

**Step 2: Proofread and collect proposed edits**

Check for spelling errors, bad grammar, inconsistencies or unclear wording. Also check for
factual errors, misconceptions or things that need more explanation or caveats.

For spelling, word choice and grammar do not be overly nitpicky. Perfection is not the goal, a
well-flowing, factually correct text is.

Granularity:

- Group mechanical corrections of the same kind within one sentence into a single proposed edit.
- Keep substantive changes — meaning, facts, added caveats — separate, one per proposed edit.
- No two proposed edits may modify overlapping text. If two changes affect the same span, emit
  them as one combined proposed edit.

NEVER propose edits to text inside fenced code blocks, inline code spans, URLs, file paths, or
quotations attributed to a source. If such text contains a genuine error, list it after the edit
list under "Observed, not edited:". It is never a numbered proposed edit.

If there are no proposed edits, say the text needs no changes and stop. Do not emit an empty
list.

**Step 3: Present proposed edits and get a decision**

If the user's request contained "auto-approve", "apply all", "just fix it" or an equivalent
instruction to proceed without review, skip this step: treat every proposed edit as approved, go
to Step 4, and report a summary of what changed.

Otherwise, emit every proposed edit as a numbered list, one entry each so the user can see what
changes. Each proposed edit contains the original text, the proposed text and a one line reason
for the change:

    3. A passkey is bound to a specific authenticator -> A device-bound passkey is bound to a specific authenticator
       There is a difference between device-bound passkeys and synced passkeys; synced passkeys are not necessarily bound to a single authenticator

Number proposed edits in document order, starting at 1. Once assigned, numbers are FROZEN for the
rest of the conversation. When re-stating the list, reuse it exactly — same numbers, same order,
same wording. NEVER renumber, re-order or re-derive the list.

Then ask exactly this: "Reply `all`, `none`, or the numbers (e.g 1,3 or 1,2,4-7) to apply."

Accepted replies:

- `all` → apply every proposed edit
- `none` → apply no proposed edit, confirm to the user and stop
- `2,5,7-9` → apply exactly those; commas and ranges both valid
- anything else → do not guess. Re-state the options and ask again.

NEVER apply a proposed edit if the user did not explicitly approve its number or if the user did
not explicitly approve all. A reply that omits a number is a rejection of that proposed edit, not
an oversight to correct.

**Step 4: Apply approved edits and verify**

Produce the corrected text and show it in the conversation. Do NOT overwrite the user's source
file unless they ask for it.

Then state: "Applied N of M proposed edits." N MUST equal the number the user approved. If it
does not, stop and report the discrepancy instead of continuing.
