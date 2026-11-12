# dsh-task-dock

A dock in the top-left corner of the DSH window that lists, in this order:

1. **Needs you** — Sessions blocked on a person: a tool waiting for approval, or
   the model waiting on an answer.
2. **Running** — Sessions whose agent is executing right now.
3. **Unread** — Sessions that stopped running while you were not looking at them.

Clicking a row opens that Session. Clicking the chip collapses or expands the
dock. The dock renders nothing at all when all three lists are empty.

## Install

```sh
dsh plugin --profile web add github:peter0429-ux/dsh-task-dock
```

Then reload the Harness page. No extra binaries, no background process, and no
edit to any shipped bundle.

## Moving it

Drag the chip (collapsed) or the title bar (expanded) to put the dock anywhere
you like; the rows stay clickable because they are not handles. A press that
travels less than 4 px is still a click, so the same handle keeps toggling the
dock. The position is memory-only on purpose: every page load puts the dock back
in its corner, so a drag can never leave it somewhere you forgot about. While
dragging, at least 40 px of the dock is kept inside the viewport.

## Turning it off

Settings → General has one row of its own, **Show the task dock**. It is the
master switch: off means the dock does not render at all — not even the chip —
so the corner is fully given back. The choice is stored in `localStorage` under
`dsh-task-dock:enabled` and survives restarts. A disabled dock still keeps its
own bookkeeping in memory, so turning it back on shows the current state
immediately instead of waiting for the next poll.

## How it is built

- Host half (`index.js`) listens to the two blocking paths —
  `approval/request` and `user-questions/request` — records the request, then
  calls `next()` unconditionally and returns whatever the real answerer returned.
  It answers nothing, delays nothing and changes no decision. The records are
  served on one route of its own, `GET /task-dock/pending`.
- Client half (`client.js`) registers one `shell.overlay` entry with the fresh id
  `task-dock`, order 40. It reads `running` and the titles from the Client session
  list feed and polls the pending route every 1.5 s (skipping hidden tabs). The
  unread set is this plugin's own bookkeeping in `localStorage`.
- The same controller drives one `settings.general.item` row (id `task-dock`,
  order 50). The General section only stacks rows, so that row draws its own
  label, value and write path.

## Notes

- The overlay seat is click-through; the dock's root opts back into pointer
  events for itself only, so it never blocks the app underneath.
- Nothing here touches a shipped seat: `sidebar.workspaces` and the rest of the
  sidebar keep their shipped occupants.
- Colours come from the `--dsw-alias-*` tokens, so light and dark themes both
  work without a second stylesheet.
