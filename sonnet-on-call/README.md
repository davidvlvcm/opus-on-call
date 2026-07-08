# sonnet-on-call

Continuity-first orchestration playbook for [Claude Code](https://claude.com/claude-code) — the inverse of [`opus-on-call`](../README.md).

The main session runs on Opus (or Fable) as the resident thinker, for the
whole session. Reasoning, architecture calls, and anything that needs this
session's continuity happen inline. Mechanical execution (edits once decided,
git/build/test loops, repetitive changes) and noisy or bulky tool output
(verbose logs, large diffs, wide greps) get delegated to short-lived
Sonnet/Haiku worker subagents that return a compact result instead of raw
output.

Why: `cache_read` on the accumulating session context is the dominant cost in
a long session, and it's charged every turn at whichever model is resident.
Staying resident on Opus/Fable means that dominant cost is paid at the
expensive rate regardless — this plugin doesn't fight that, it accepts it in
exchange for continuous top-tier reasoning with no re-briefing loss between
turns. What it controls instead is how much low-value bulk ever enters that
already-expensive context: mechanical work happens and gets mostly discarded
at cheap rates in an isolated subagent, so only a small, high-value result
ever joins the resident context.

If raw dollar cost matters most, [`opus-on-call`](../README.md)'s
Sonnet-resident setup is strictly cheaper — use that instead. Use this one
when the session's value comes from sustained judgment (a long design
conversation, an incident review, an iterative creative-writing session) and
you don't want mechanical grunt work diluting it.

## Install

```
/plugin marketplace add davidvlvcm/opus-on-call
/plugin install sonnet-on-call
```

## Use

```
/sonnet-on-call
```

Manual-only — invoke it at the start of a session you want run this way. A
bundled `UserPromptSubmit` hook then re-states the routing rule each turn for
that session, so the resident agent doesn't drift back to doing mechanical
work itself as the context grows. Turn it off with `/sonnet-on-call off`. See
[skills/sonnet-on-call/SKILL.md](skills/sonnet-on-call/SKILL.md) for the full
routing rules.

Defaults to pinning `model: opus`. For a session where creative or narrative
judgment matters more than analytical rigor, change the `model: opus` line in
[skills/sonnet-on-call/SKILL.md](skills/sonnet-on-call/SKILL.md) to
`model: fable` before invoking — the routing rules apply unchanged either way.

## License

MIT
