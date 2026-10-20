# Let an AI make the video

OneTake is built so that a coding agent can make a demo video of your project end to end.
The agent picks a scenario from your browser tests, signs in through a session you save,
maps the pages, writes the tour, checks it, renders it, and looks at the result.

## What the agent reads

| File | For |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | The workflow, the API and recorder cheat sheets, and the gotchas. Codex, Cursor, Copilot, Gemini and most agents read it automatically. |
| [`CLAUDE.md`](../CLAUDE.md) | Points Claude Code at `AGENTS.md`. |
| [`skills/onetake-demo-video/SKILL.md`](../skills/onetake-demo-video/SKILL.md) | A Claude skill with the same workflow, so Claude uses it whenever you ask for a demo video. |
| [`llms.txt`](../llms.txt) | A map of the repo for tools that read `llms.txt`. |
| [`templates/demo-kit/`](../templates/demo-kit/) | The kit the agent copies next to your project. |
| `docs/` | The full reference, when it needs details. |

## How to ask

With this repo and your project both available to the agent:

> Make a demo video of this app with OneTake. Pick a core flow from the browser tests,
> about a minute long. The app runs at http://localhost:8000 and needs a sign-in.

Things that help:
- Say **which flow**, or let it choose and tell you why.
- Say **where the app runs**, and whether it needs a sign-in. The agent will ask you to sign
  in once, in a window it opens, and never asks for your password.
- Say **what it may create**: the tour performs real actions in the app.
- Mention the **output** you want: `frame`, intro and outro text, `sound`, vertical
  (`--aspect 9:16`), a GIF for the README.

## What you get back

A `<project>-demo/` folder next to your project with `onetake.config.js`, `tour.js`, and
`record.sh`, plus the video if the agent could reach your app. If it can't (a cloud sandbox
can't open your `localhost`, for example), it hands you `bash record.sh` to run yourself.
Rendering on your machine gives exactly the same video.

## Installing the Claude skill

In Claude Code, copy `skills/onetake-demo-video/` into `~/.claude/skills/` (for you) or
`.claude/skills/` (for a project). In the Claude apps, zip the folder and add it as a custom
skill in your settings.
