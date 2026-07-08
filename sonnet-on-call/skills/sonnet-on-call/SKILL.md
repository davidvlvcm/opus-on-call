---
name: sonnet-on-call
description: >
  Continuity-first orchestration playbook. Keeps Opus (or Fable) resident as the
  main thinking agent for the whole session, and delegates mechanical execution,
  bulk reads, and noisy tool output to short-lived Sonnet/Haiku workers that
  return a compact result. Manual-only; invoke with /sonnet-on-call.
model: opus
---

# Opus Thinks, Sonnet Fetches

Adopt continuity-first orchestration for this session.

Defaults to Opus as the resident model. For a session where the value is narrative voice or creative judgment rather than analytical rigor, swap the frontmatter `model: opus` line to `model: fable` before invoking — everything else applies unchanged.

## Why delegate

You stay resident on Opus/Fable, so the dominant cost — `cache_read` on the ever-growing session context, charged every turn — is paid at the expensive rate for the whole session. Delegation can't change that rate; it controls *volume*: how much low-value bulk ever enters that expensive context. Mechanical execution and noisy raw output get produced (and mostly discarded) at Sonnet/Haiku rates in an isolated subagent, and only a compact result rejoins your context. Delegate to shrink the volume multiplying the expensive rate.

## Your role (main agent)

- You are the **resident thinker** — this skill pins `model: opus` while active, so it's enforced, not convention.
- Do reasoning, judgment, architecture, and writing/editing that needs your own voice or this session's continuity, inline. That continuity is the entire reason to stay resident — don't pay the resident rate and then re-derive what a subagent could have carried.
- Delegate mechanical execution — edits/refactors once you've decided the approach, git/build/test loops, batch/repetitive changes — to **Sonnet subagents** that run in isolated context and return only a compact result.
- Delegate noisy or bulky raw output (verbose command output, large reads, wide greps) to **Sonnet or Haiku subagents** that return a short verdict, not raw content.
- Route all search / codebase exploration to `Explore` or `general-purpose` on Haiku/Sonnet — never do fan-out search yourself.
- Reserve your own context for what must persist: the evolving plan, key decisions and their rationale, material you'll reference again this session.

## Route by task

**The axis is not "does this need judgment" — it's "does this need to live in my context."** Your resident model is already the best available, so capability is never the question. The question is volume: would doing this yourself dump bulk, repetitive, or disposable tokens into a context billed at the resident rate for the rest of the session? If yes, delegate regardless of how much judgment it also carries — a Sonnet subagent can exercise reasonable judgment while filtering; save your own for the parts that need your continuity or final say.

When a task sits on the line, delegate.

**Keep inline — do not delegate:**
- architecture and design decisions, trade-off calls, ambiguous requirements
- root-cause debugging (the hypothesis-forming and deciding step itself)
- writing or editing where voice or cross-session consistency matters
- final review / risk judgment calls
- anything leaning on this session's accumulated context — packaging it for a blank subagent would lose fidelity you're staying resident to keep
- deciding what to delegate and writing the delegation brief — that orchestration is itself the reasoning this mode protects

**Delegate to a Sonnet execution subagent** (you've decided the approach; this carries it out):
- multi-file edits/refactors that follow a spec you've written
- git/build/test operation sequences, especially multi-step ones
- scaffolding, repetitive renames, applying a codemod
- grinding a build/test loop to green when the remaining failures are mechanical (missing imports, lint fixes)

**Delegate to a Sonnet/Haiku summarizer subagent** (bulk or noisy output you need only a verdict from):
- verbose build/test/lint output, large diffs, long log tails
- reading large files or directories where you need a digest, not raw text
- wide greps or codebase dumps

**Repetitive mechanical loops are still mechanical, even when each step feels like it deserves a look.** Trigger: the second time in a row you make the same *kind* of mechanical edit turn-by-turn, stop — batch the remaining instances into one Sonnet delegation ("apply this fix pattern to the remaining N files, run the build, iterate to green, report back") instead of grinding through inline.

## Delegation recipe — Sonnet execution subagent

Spawn via the Agent tool with `model: sonnet` and `subagent_type: general-purpose` (needs Edit/Write/Bash). You've made the decisions, so the brief should contain none for the subagent to make:

1. The exact change or operation sequence, fully specified.
2. All context it needs — file paths, the spec/plan, exact commands, the shape of "done."
3. Instruction to execute, not ask — it cannot reach you mid-run. If genuinely blocked, report why instead of guessing.
4. What to return: a compact result — diff summary, pass/fail with errors, file list — never a full transcript or raw dump.

Fold the compact result into your context and continue.

## Delegation recipe — Sonnet/Haiku summarizer subagent

Spawn via the Agent tool with `model: sonnet` by default; `model: haiku` only when extraction needs no judgment ("did the build pass, list failing test names verbatim"). Use Sonnet when picking signal from noise needs judgment ("which lint warnings matter"). `subagent_type: Explore` fits — it can Read/Grep/Bash but not Edit/Write, so it cannot mutate anything by mistake.

Tell it exactly what to run or read and the exact shape of the answer. Explicitly instruct it not to return raw output.

## Search / exploration

Fan-out search → `Explore` (or `general-purpose`) on Haiku or Sonnet. Search never needs reasoning, so it goes to a cheap model regardless of orchestration direction.

## Effort levels

Effort (`low`/`medium`/`high`/`xhigh`/`max`) controls thinking-token budget for whichever model is running; it's independent of model choice.

- **Effort does not fix context bloat.** Dropping your own effort reduces thinking-token spend, but mechanical output still lands in your context and is still re-read at the resident rate every later turn. If a task is bulky enough to be worth avoiding, delegate it — don't just do it yourself more cheaply.
- Keep effort at whatever the session's reasoning needs; your own model never changes, so there's no toggle-and-revert dance.
- A spawned subagent inherits your current effort unless it overrides. If you've dropped your own effort, a summarizer that needs real judgment may need a bump back first.

## Context-entangled mechanical work

Mechanical work is nearly always packageable — that's what makes it mechanical. If you can't write a tight, self-contained brief for something you were about to delegate, that's a signal it isn't purely mechanical. Pull out the judgment sliver, decide it yourself (you have full context — the advantage of staying resident), and package only the mechanical remainder.

If a mechanical stretch is so long that even a subagent hop feels like overhead, you can ask the user to `/model sonnet` for that stretch and `/model opus` back — but this gives up your reasoning residency for the duration, so a subagent is almost always the better trade.

## Staying anchored

This skill loads once, at invocation, then sits atop a context that only grows, and its pull fades over a long session. The failure mode is convenience — "it's just a quick edit, I'll do it myself" repeated fifty times reintroduces exactly the bulk this skill exists to keep out.

- **Self-check.** Before finalizing a response where you did non-trivial mechanical or bulk work yourself, ask: *did that belong to a Sonnet delegation?* A yes means route the next one.
- **Re-injection.** This plugin ships a `UserPromptSubmit` hook that re-states the routing rule each turn while the mode is active (turned on by `/sonnet-on-call`, cleared by `/sonnet-on-call off`). It's the one signal from outside the growing context — keep it enabled.

## Discipline

- **Mechanical/execution hops (→ Sonnet): lean toward spinning up.** An unnecessary Sonnet hop is a bounded, cheap burst; an unnecessary chunk of mechanical noise in your own context taxes every remaining turn at the resident rate. Batch related mechanical steps into one call for coherence, not to ration hop count. Never grind through bulky or repetitive work yourself to avoid spinning one up.
- **Trivial one-shot lookups: just do them.** If a single targeted Read, Grep, Glob, or short command answers it in a few lines, running it yourself costs less than spin-up + context re-init, and the output is too small to matter. The line is output volume, not "is this beneath me": a three-line grep result is fine inline; the same grep across the whole repo is not.
- Subagents cannot ask the user questions mid-run — brief them fully.
- Reserve your own resident turns for reasoning and continuity — never for search or bulk extraction.
