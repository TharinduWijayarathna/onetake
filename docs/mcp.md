# MCP server

`onetake mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI
agent can explore your app and build a tour with tools instead of guesses. It opens pages
with your saved login, lists what can be clicked or typed into (each with a target that's
known to work), tests targets, plays steps, dry-runs the tour and renders the video.

Agents that can run commands (Claude Code, Codex, Cursor's agent) can also use the
[CLI](recording.md) directly. The MCP server adds the page inspector and gives apps without a
terminal, such as Claude Desktop, the whole workflow.

## Set it up

No clone needed. Install OneTake once, globally, with its browser:

```bash
npm install -g github:TharinduWijayarathna/onetake
onetake setup
```

Then add the server to your agent.

**Claude Code**

```bash
claude mcp add onetake -- onetake mcp
```

**Claude Desktop** (`claude_desktop_config.json`), **Cursor** (`.cursor/mcp.json`) and most other clients:

```json
{
  "mcpServers": {
    "onetake": { "command": "onetake", "args": ["mcp"] }
  }
}
```

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.onetake]
command = "onetake"
args = ["mcp"]
```

Without a global install, use `npx` instead: command `npx`, args
`["-y", "github:TharinduWijayarathna/onetake", "mcp"]` (the first start downloads it). If the
client can't find `onetake` or `npx`, give the full path (`which onetake`). From a clone, use
`node /path/to/onetake/bin/onetake.js mcp`.

The server runs headless Chromium in the background and keeps one page open between calls.
Most tools take `cwd`: the demo kit folder with `onetake.config.js` and `auth.json`. Clients
start servers in different folders, so agents should always pass it.

## Why it runs on your machine

The server can't be hosted on the docs site, or anywhere else, and pointed at by URL:

- GitHub Pages only serves static files, and an MCP server is a running program.
- More importantly, the tools drive a real browser that has to reach *your* app, usually on
  `localhost` and signed in with your `auth.json`. A server somewhere else can't see your
  `localhost`, and shouldn't hold your session.

So `onetake mcp` runs locally, started by your agent. What the site does host is the docs in
forms agents read directly, with no server:

| URL | |
|---|---|
| `https://tharinduwijayarathna.github.io/onetake/llms.txt` | The map of the docs, with a link to every page |
| `https://tharinduwijayarathna.github.io/onetake/llms-full.txt` | Every page in one file |
| `https://tharinduwijayarathna.github.io/onetake/md/<page>.md` | One page as Markdown, e.g. `md/mcp.md` |
| `https://tharinduwijayarathna.github.io/onetake/<page>/` | The page itself, e.g. `mcp/`, `api/#options` |

An agent that can fetch URLs can learn OneTake from these even before the server is installed.

## Tools

| Tool | What it does |
|---|---|
| `open_page` | Opens a page (default: the kit's `url`) with the kit's viewport and saved login, and returns the inspection below. |
| `inspect_page` | Lists headings, regions (forms, tables, dialogs: good zoom targets), fields (with their type, value and options) and buttons, links and tabs. Each comes with a OneTake target that matches exactly that element. `scope` limits it to part of the page. |
| `test_target` | Says whether a target matches exactly one visible element, and lists the matches with their `nth=` when it doesn't. |
| `run_steps` | Plays OneTake steps on the open page with real mouse and keyboard input, for example `take.click('text=New client')`. Use it to reach the next state while exploring. Page loads are fine. |
| `screenshot` | The open page, or one element (`target`). |
| `check_tour` | Runs `onetake check` on the kit: every step with its line, or the first failure with its reason and a screenshot. |
| `record_video` | Runs `onetake record` and returns the files. `preview: true` renders at 1× and 30 fps, about 6× faster. `args` passes extra flags. |
| `get_docs` | Any page of this documentation (`api`, `targets`, `recipes`…). |

`check_tour`, `run_steps` and `record_video` perform real actions in the app, the same as the CLI.

## What the inspector returns

```
New client · http://localhost/clients/create

Headings:
  role=heading[name="New client"]

Regions (good zoom targets):
  form[action*="/clients"]   — Client details

Fields:
  label=Name   [text]
  label=Email   [email]
  label=Nationality   [select, options: Choose… | United Kingdom | Sri Lanka]
  label=Explorer   [checkbox]

Buttons, links, tabs:
  role=button[name="Save"]
  role=button[name="Save and create inquiry"]
  role=link[name="Clients"]
  text=Open >> nth=2   — Open
```

Targets are tried in this order: `label=` for fields, then `role=…[name="…"]`, `text=`, `#id`,
and test-id or `name` attributes. The first one that matches only that element wins. When
none is unique, the inspector falls back to `>> nth=`. Scope it yourself for something
sturdier (`'#card-3 >> text=Open'`) and check it with `test_target`.

## A typical session

1. `open_page { cwd: "~/Developer/acme-demo" }`: the start page and its targets.
2. `run_steps` with the first actions, then `inspect_page` again on the next state. Repeat
   through the flow.
3. Write `tour.js` from the targets you collected.
4. `check_tour { cwd }`, fixing failures until it passes.
5. `record_video { cwd, preview: true }`, then once more without `preview`.

## Troubleshooting

- **"Chromium for OneTake isn't installed yet"**: run `onetake setup`.
- **The page opens signed out**: the tool says so. Create the login with `onetake login`
  ([Recording → Logins](recording.md#logins)).
- **Nothing happens in the client**: the server logs to stderr. Run
  `onetake mcp` in a terminal: it prints `onetake MCP server … ready` and waits for
  JSON-RPC on stdin.
