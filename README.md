# m7skills

Accessibility skills for coding agents. Each skill is a folder with a `SKILL.md` in the open [Agent Skills](https://agentskills.io) format, so the same files work in Claude Code, GitHub Copilot, Cursor, Codex, Gemini CLI, Windsurf, OpenCode and any other harness that reads skills.

## Skills

| Skill | What it does |
| --- | --- |
| [`announcer`](skills/announcer/SKILL.md) | Gives a web codebase one shared screen reader announcer: a polite and an assertive live region with a queue, routed into open modal dialogs. Then it finds every live region, toast and announce call, decides whether each one should be replaced, kept, converted or removed, migrates them, and records in a browser what reaches screen readers. |
| [`forced-colors`](skills/forced-colors/SKILL.md) | Reviews and fixes a web UI for forced colors (Windows contrast themes). Takes screenshots in normal, forced-dark and forced-light modes, finds controls and states that disappear or merge, fixes them with system colors following Fluent UI and Spectrum conventions, and writes a before/after HTML report. |
| [`screen-reader-modes`](skills/screen-reader-modes/SKILL.md) | Finds what puts screen readers into focus, forms or application mode. Lists every role, native control, focusable element and key handler in a codebase, predicts per screen reader (JAWS, NVDA, Narrator, Orca; VoiceOver and TalkBack have no modes) what happens when focus lands there, presses each widget's keys in a browser, and decides per component whether the switch is needed, needless, missing or broken. Writes a report and a screenshot map of the modes. |

## Install

### Any agent: the `skills` CLI

```sh
npx skills add bremmdev/m7skills
```

It asks which skills and which agents to install for, then puts the skills where each agent looks. Useful flags:

```sh
npx skills add bremmdev/m7skills --list                         # show the skills
npx skills add bremmdev/m7skills -s forced-colors -a cursor     # one skill, one agent
npx skills add bremmdev/m7skills -g                             # for your user, not this project
```

### Claude Code: plugin marketplace

```
/plugin marketplace add bremmdev/m7skills
/plugin install bremmdev-a11y@m7skills
```

Skills then show up as `bremmdev-a11y:<skill>` and update with `/plugin marketplace update`.

### By hand

Copy a folder from `skills/` into the folder your agent reads:

| Agent | Project | User |
| --- | --- | --- |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| GitHub Copilot | `.agents/skills/` or `.github/skills/` | `~/.copilot/skills/` |
| Cursor | `.agents/skills/` | `~/.cursor/skills/` |
| Codex | `.agents/skills/` | `~/.codex/skills/` |
| Gemini CLI | `.agents/skills/` | `~/.gemini/skills/` |

Keep the whole folder: `SKILL.md` links to the `references/`, `scripts/` and `assets/` next to it.

## Requirements

`forced-colors` captures screenshots with Node and Playwright or Puppeteer. Without them it falls back to the browser tools your agent has, or to a static review. See [`capture.md`](skills/forced-colors/references/capture.md).

`announcer` runs its inventory with Node, and records announcements in a browser with Node and Playwright or Puppeteer. Without them it runs `recorder.js` through the browser tools your agent has, or says in its report that the browser check is missing. See [`testing.md`](skills/announcer/references/testing.md).

`screen-reader-modes` runs its inventory with Node, and maps the modes of rendered pages with Node and Playwright or Puppeteer. Without them it runs `modes.js` through the browser tools your agent has, or predicts from the inventory and says in its report that the browser check is missing. See [`testing.md`](skills/screen-reader-modes/references/testing.md).

## Adding a skill

1. Create `skills/<name>/SKILL.md`. The frontmatter `name` must equal the folder name, and `description` says what the skill does and when to use it.
2. Write it for any harness: no tool names or paths specific to one agent, and paths relative to the skill folder.
3. Add `./skills/<name>` to `skills` in [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) and a row to the table above.

## License

[MIT](LICENSE)
