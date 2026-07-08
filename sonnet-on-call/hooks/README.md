# sonnet-on-call Hooks

Bundled with the plugin and active automatically once installed. No manual setup.

## What's included

### `sonnet-on-call-tracker.js` — UserPromptSubmit hook

Fires on every user prompt. Two jobs:

1. **Track activation.** Scans the prompt for `/sonnet-on-call` (and natural-language
   equivalents like "enable sonnet-on-call") to turn the mode on, and for
   `/sonnet-on-call off` / "stop sonnet-on-call" to turn it off.
2. **Re-anchor.** While the mode is on for the session, it injects the routing
   rule back into context as hidden `additionalContext`.

Why re-anchor: `SKILL.md` loads once, at invocation, then sits atop a context
that only grows — its pull fades over a long session. Here the drift is toward
convenience (doing mechanical work yourself instead of delegating it) rather
than toward under-escalating judgment, but the fix is the same: a per-turn
re-injection is the one signal that comes from outside the growing context, so
it re-anchors reliably where the static skill text cannot.

## Activation flag

Activation is tracked with a flag file, one per session:

```
$CLAUDE_CONFIG_DIR/.sonnet-on-call/active-<session_id>
```

- **Existence is the whole signal** — the file's content is never read back into
  context, so the hook only ever injects the fixed routing reminder it controls,
  never bytes from disk.
- **Per-session, not global.** The session id scopes the flag so the reminder
  fires only in sessions where `/sonnet-on-call` was invoked — it never leaks
  into other concurrent sessions, and it doesn't persist into unrelated later
  ones.
- Stale flags (older than 7 days) are swept on each run, since a session that
  just ends never clears its own flag.
- Namespaced separately from opus-on-call's `.opus-on-call/` flag dir, so
  the two plugins' activation states never collide if both are installed.

## Security

- The `session_id` is sanitized to `[A-Za-z0-9_-]` before it forms a path, so a
  malformed value can't escape the flag directory. A missing or empty id is a
  no-op — no global fallback flag is written.
- The flag write refuses a symlinked target or parent directory and writes
  atomically (temp + rename, `0600`), so a local attacker can't redirect the
  predictable path to clobber another file.
- Every filesystem operation silent-fails — a hook must never break the turn.

## Cost

The reminder is one short paragraph, injected only on turns where the mode is
active. Unlike opus-on-call's reminder, this one rides the *resident* (expensive)
model's context on every active turn rather than a cheap one, so keeping it
tight matters even more here — the paragraph itself is a fixed, small cost, but
it's charged at the higher rate for the rest of the session once it's in
context.

## Enable / disable

- Installed with the plugin — no setup.
- `/sonnet-on-call off` clears the mode for the current session.
- Disable the plugin to remove the hook entirely.

> Plugin hooks load at Claude Code startup. After install or update, reload
> Claude Code before the hook takes effect.
