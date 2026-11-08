# Kanban for Claude

A Claude Code mod for the Claude desktop app (Code tab) that shows your sessions as a kanban board next to the conversation. Each session is a card, each lane is a work stage, and the sidebar section is only the card's label.

The board's interface is in Brazilian Portuguese; code, comments and docs are in English.

An independent project, not made or endorsed by Anthropic. Claude is a trademark of Anthropic.

## Features

- **Lanes by work stage:** Sem status, A fazer, Precisa de atenção, Fazendo, Feito, Revisar and Arquivar. A session nobody placed sits in "Sem status"; a running session shows in "Fazendo" while it runs.
- **Drag and drop:** drop a card on another lane to change its stage. Stages are saved on your computer and shared by every session and app window, even with several boards open at once.
- **Cards:** a section picker (with "Fixado", which pins the session in the sidebar), the title (click a cut title to read it whole), the time since the last activity and an "Abrir" button.
- **Right-click menu:** Abrir, Renomear and Arquivar.
- **Search:** title and section match at once; with three letters or more, the conversation text matches too, through the app's own search.
- **Sort and filter:** by activity, idle time, creation or title; show only sessions with a section, all of them, running ones, pinned ones, or the ones waiting for you.
- **Waiting for you:** a session stopped on a permission prompt, a question or a plan gets a blinking yellow dot and "aguarda você" on its card. It shows after 2 seconds without an answer and clears once you answer.
- **"Arquivar" lane:** collect the sessions to archive there and press "[ARQUIVAR TODAS]", which asks first. Pinned and running sessions stay in the lane, with a notice; the right-click "Arquivar" unpins a pinned session first.
- **Only the chosen session is archived:** the app archives a session's linked sessions (the ones it started) together with it, and the board unarchives those right away.
- **First run:** the board lists your sidebar sections and asks, once, which lane each section's sessions go to. You can apply or skip; sessions already in a lane never move.

## What it does in your app

The board acts only when you ask, always through the app's own tools: it moves sessions between sections, pins and unpins them, renames them, archives them (and unarchives the linked sessions the app archived along), and opens a session through the app's `claude://` link.

To draw the board it reads the app's session and section lists, the app's conversation search, and each session's creation date from the app's registry in `~/Library/Application Support/Claude/claude-code-sessions`. It keeps the stages, the first-run answer and the waiting reports in the mod's own store file, under `~/.claude/plugins/store/`. Nothing leaves your computer.

Outside the "bypass permissions" mode, the app may ask you to approve some of these actions.

## Requirements

- The Claude desktop app on macOS, Code tab. "Abrir" uses macOS's `open`, and creation dates come from the app's folder on the Mac.

## Install

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace, enter `mumurilolima-ht/kanban-for-claude`, then Add plugin on kanban-for-claude.

Or at the prompt of a Claude Code session in the terminal (answer `y` to add the marketplace and pick the `user` scope, which applies to every folder):

```text
/plugin install kanban-for-claude --marketplace mumurilolima-ht/kanban-for-claude
```

Then run `/reload-plugins` in a session of the app, or open a new session.

## Use

Type `/kanban` (or `/dash`) to open or close the board. When it opens, the board's session moves to a window of its own, so the board stays on screen when a card's "Abrir" brings another session to the main window. Close that window when you no longer need the board.

While it is open, the board re-reads the sessions every 30 seconds and the waiting reports every 5.

## Update

```bash
claude plugin marketplace update kanban-for-claude
claude plugin update kanban-for-claude@kanban-for-claude --scope user
```

Then run `/reload-plugins` in the open sessions.

## Uninstall

```bash
claude plugin uninstall kanban-for-claude@kanban-for-claude --scope user
claude plugin marketplace remove kanban-for-claude
```

## Development

### Project structure

| Path | What it holds |
| --- | --- |
| `.claude-plugin/plugin.json` | The manifest (name, version, description). |
| `.claude-plugin/marketplace.json` | Makes this repository a marketplace with one plugin. |
| `hooks/register.tsx` | The hooks module: wires events, commands, the board's messages and the pane. |
| `hooks/state.ts` | The session state the pane draws from, and the only functions that read or write it. |
| `hooks/stages.ts` | Saved stages: the store shared by every board, and the lane rules. |
| `hooks/pane.tsx`, `hooks/setup.tsx` | The pane (header, toolbar, board props) and the first-run section mapping. |
| `hooks/board.tsx` | The board's surface module: lanes, cards, drag and drop, menus, the blinking dot. |
| `hooks/archive.ts` | Archiving one session or the whole "Arquivar" lane, keeping linked sessions. |
| `hooks/waiting.ts` | The waiting reports: written by every session, read by the board. |
| `hooks/app.ts` | Calls to the desktop app's tools. |
| `hooks/actions.ts`, `hooks/messages.ts`, `hooks/lifecycle.ts`, `hooks/refresh.ts` | Card actions, the board's message router, opening and closing the pane, and the refresh. |
| `hooks/constants.ts`, `hooks/filters.ts`, `hooks/format.ts`, `hooks/session-dates.ts` | Shared constants, filters and sorting, labels, and creation dates. |
| `types/index.d.ts` | The data types and the state contract. |
| `tests/` | Tests, one file per area, with shared fakes in `tests/helpers.ts`. |

### Commands

```bash
make test       # validates the manifest and hooks, then runs the tests with the desktop app's engine
make typecheck  # type-checks hooks and tests (needs the types the app writes when it loads the mod)
make validate   # both; run it before every pull request
```

`make test` runs `scripts/test.sh`, which uses the engine bundled with the desktop app, since the `claude` in the terminal may be older and refuse what the app accepts. The app writes the types into `.claude-plugin/types/` (ignored by git) the first time it loads the mod from this folder.

### Engine rules worth knowing

- A function that receives `$` from another file must be a function declaration (`function name($) {}`); the engine's scan does not follow `$` into an arrow function across an import.
- State references are only accepted in the file that declares them, so every read and write of session state goes through `hooks/state.ts`.
- Hook matchers are written as literals, so the scan can read them.
- The board's surface module has no JSX factory: elements are called as functions.
- Plugin names starting with `claude-` are reserved by Claude Code.

### Data compatibility

The store keys are `stages` (`{ [sessionId]: { stage, at } }`), `sectionMapping` (the first-run answer) and `waiting:<sessionId>` (one report per waiting session). Lane ids (`no-status`, `todo`, `attention`, `doing`, `done`, `review`, `archive`) are saved in `stages`. Changing a key, a lane id or a stored shape is a breaking change: describe it in the pull request and in the changelog.

### Contributing

Issues and pull requests are welcome.

- One branch per change, named `feature/<what>` or `fix/<what>`.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.
- Versions follow [Semantic Versioning](https://semver.org/): a `feat` raises the minor version, a `fix` the patch. Bump `.claude-plugin/plugin.json` and add the change to `CHANGELOG.md`.
- Open a pull request with the template in `.github/pull_request_template.md`, with screenshots or a GIF for anything visual, and `make validate` passing.

## License

[MIT](LICENSE).
