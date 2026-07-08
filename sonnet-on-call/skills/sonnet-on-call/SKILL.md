---
name: sonnet-on-call
description: >
  Continuity-first orchestration playbook. Keeps Opus (or Fable) resident as
  the main thinking agent for the whole session, and delegates mechanical
  execution, bulk reads, and noisy tool output to short-lived Sonnet/Haiku
  worker subagents that return a compact result. Manual-only; invoke with
  /sonnet-on-call, ideally at the start of a session.
model: opus
---

# Opus Thinks, Sonnet Fetches

Adopt continuity-first orchestration for this session.

Defaults to Opus as the resident model. For a session where the value is
narrative voice or creative judgment rather than analytical rigor, swap the
frontmatter `model: opus` line to `model: fable` before invoking — everything
else in this playbook applies unchanged to either.

## Why this is not opus-on-call in reverse

opus-on-call controls cost by keeping the dominant cost driver —
`cache_read` on the ever-growing session context, charged every turn at
whichever model is resident — on the cheap model, and only bursts to Opus in
small isolated subagents that never touch the main thread's context.

This skill does not achieve that. Staying resident on Opus/Fable means the
dominant cost is paid at the expensive rate for the whole session, full stop —
no amount of delegation changes that. What delegation *does* control is how
much low-value bulk ever enters that already-expensive context: mechanical
execution and noisy raw output get produced (and mostly discarded) at
Sonnet/Haiku rates in an isolated subagent, and only a compact result rejoins
your context, where it will now be re-read at the expensive rate on every
future turn regardless of which model produced it. Delegation shrinks the
volume multiplying the expensive rate; it does not lower the rate itself.

So: if raw $ cost is what matters most, opus-on-call's Sonnet-resident
setup is strictly cheaper — use that instead. Use this skill when the session's
value comes from sustained, continuous top-tier judgment (a long design
conversation, an incident review, an iterative creative-writing session) where
re-briefing a fresh Opus subagent every few turns would lose fidelity you
actually need, and you're willing to pay resident-tier rates for that
continuity — but you still don't want mechanical grunt work diluting your
context or burning your turns.

## Your role (main agent)

- You are the **resident thinker** — this skill pins `model: opus` for the
  session while active, so this is enforced, not just a convention.
- Do reasoning, judgment, architecture, and writing/editing that needs your
  own voice or this session's continuity, inline. That continuity is the
  entire reason to stay resident — don't pay the resident rate and then
  re-derive things a subagent could have carried anyway.
- Delegate mechanical execution — edits/refactors once you've decided the
  approach, git/build/test loops, batch/repetitive changes — to **Sonnet
  subagents**. They run in isolated context and return only a compact result,
  so the mechanical steps to get there never land in your context.
- Delegate noisy or bulky raw output (verbose command output, large reads,
  wide greps) to **Sonnet or Haiku subagents** that return a short verdict
  instead of the raw content.
- Route all search / codebase exploration to `Explore` or `general-purpose`
  on Haiku/Sonnet — never do fan-out search yourself.
- Keep your own context reserved for what actually needs to persist: the
  evolving plan, key decisions and their rationale, material you'll reference
  again this session.

## Route by task

**The axis here is not "does this need judgment" — it's "does this need to
live in my context."** opus-on-call routes on capability (is the resident
model good enough for this task) because its resident model is the cheap one.
Your resident model is already the best one available, so capability is never
the question. The question is volume: would doing this yourself dump bulk,
repetitive, or disposable tokens into a context that's billed at the resident
rate for the rest of the session? If yes, delegate regardless of how much
judgment the task also happens to carry — a Sonnet subagent can still exercise
reasonable judgment while filtering and summarizing; save your own judgment
for the parts that need your continuity or final say.

When a task sits on the line, delegate. A spurious Sonnet hop costs a bounded,
isolated burst at cheap rates; an unnecessary chunk of mechanical noise taxes
every remaining turn of this session at the resident rate. Both skills bias
toward hopping when unsure — they just hop in opposite directions, because the
resource each is protecting differs: opus-on-call protects judgment quality on
a cheap resident; this protects context volume on an expensive one.

**Keep inline — do not delegate:**
- architecture and design decisions, trade-off calls, ambiguous requirements
- root-cause debugging (the hypothesis-forming and deciding step itself)
- writing or editing where voice or cross-session consistency matters
- final review / risk judgment calls
- anything that leans on this session's accumulated context — packaging it
  for a blank subagent would lose fidelity you're staying resident to keep
- deciding what to delegate and writing the delegation brief — that
  orchestration work is itself the reasoning this mode exists to protect

**Delegate to a Sonnet execution subagent** (you've already decided the
approach; this is carrying it out):
- multi-file edits/refactors that follow a spec you've already written
- git/build/test operation sequences, especially multi-step ones
- scaffolding, repetitive renames, applying a codemod
- grinding a build/test loop to green when the remaining failures are
  mechanical (missing imports, lint fixes) and don't need your judgment

**Delegate to a Sonnet/Haiku summarizer subagent** (bulk or noisy output you
don't need verbatim, only a verdict):
- verbose build/test/lint output, large diffs, long log tails
- reading large files or directories where you need a digest, not the raw text
- wide greps or codebase dumps

**Repetitive mechanical loops are still mechanical, even when each single
step feels like it deserves a look.** The failure mode here mirrors
opus-on-call's diagnostic-loop drift, just inverted: there, individually
mechanical-looking steps aggregate into a reasoning task that should have
escalated. Here, individually plausible-looking "I'll just fix this one too"
steps aggregate into a mechanical task that should have been batched.
Concrete trigger: the second time in a row you make the same *kind* of
mechanical edit or fix turn-by-turn, stop — batch the remaining instances into
one Sonnet delegation ("apply this fix pattern to the remaining N files, run
the build, iterate to green, report back") instead of grinding through the
rest inline.

## Delegation recipe — Sonnet execution subagent

Spawn via the Agent tool with `model: sonnet` and `subagent_type:
general-purpose` (needs Edit/Write/Bash, so not `Explore` or `Plan`). You've
already made the decisions, so the brief should contain none for the subagent
to make:

1. The exact change or operation sequence, fully specified.
2. All context it needs — file paths, the spec/plan, exact commands, the
   shape of "done."
3. Instruction to execute, not to ask for clarification — it cannot reach you
   mid-run. If it's genuinely blocked, it should report why instead of
   guessing.
4. Instruction on what to return: a compact result — diff summary, pass/fail
   with errors, file list — never a full transcript or raw dump.

Fold the compact result into your context and continue.

## Delegation recipe — Sonnet/Haiku summarizer subagent

Spawn via the Agent tool with `model: sonnet` by default; `model: haiku` only
when the extraction needs no judgment at all ("did the build pass, list
failing test names verbatim"). Use Sonnet when picking signal from noise
needs some judgment ("which of these lint warnings matter"). `subagent_type:
Explore` is a good fit — it can Read/Grep/Bash but can't Edit/Write, so a
summarization task literally cannot mutate anything by mistake.

Tell it exactly what to run or read and the exact shape of the answer you
need. Explicitly instruct it not to return the raw output.

## Search / exploration

This is the one section that doesn't flip. Fan-out search → `Explore` (or
`general-purpose`) on Haiku or Sonnet, same as opus-on-call. Search was
never routed by "which model is resident" — it's routed to cheap models
because it never needed reasoning in the first place, regardless of which
direction the rest of the orchestration runs.

## Effort levels

Effort (`low`/`medium`/`high`/`xhigh`/`max`) controls thinking-token budget
for whichever model is running; it's independent of model choice and of this
skill's context-volume concern.

- **Effort does not fix context bloat.** opus-on-call can suggest dropping
  to `/effort low` for a mechanical stretch instead of hopping, because there
  inline-cheap and delegate-cheap are the same rate — the only difference is
  spin-up overhead. That substitution does not hold here: dropping your own
  effort reduces your thinking-token spend, but the mechanical output still
  lands in your context and is still re-read at the resident rate on every
  later turn. If a task is bulky enough to be worth avoiding, delegate it —
  don't just do it yourself more cheaply.
- Keep effort at whatever level the session's reasoning needs; there's no
  toggle-up-then-revert dance around delegation the way opus-on-call does
  around escalation, because your own model never changes.
- A spawned subagent inherits your current effort level unless it overrides
  it. If you've dropped your own effort for some other reason, a summarizer
  subagent that needs to exercise real judgment (picking signal from noise)
  may need a bump back first.

## Context-entangled mechanical work

opus-on-call has a real, common escape hatch here: a decision can be so
entangled in live session state that packaging it for a blank subagent loses
too much, so it stays with the user's own `/model opus` burst instead of a
subagent. That case is rare for you. Mechanical work is nearly always
packageable — that's what makes it mechanical — so if you find yourself
unable to write a tight, self-contained brief for something you were about to
delegate, that's a signal it isn't purely mechanical after all. Pull out the
judgment sliver, decide it yourself (you already have full context — that's
the advantage of staying resident), and package only the mechanical remainder
for delegation.

If a mechanical stretch is so long that even a subagent hop feels like
overhead, you can ask the user to `/model sonnet` for that stretch and
`/model opus` back afterward — but this gives up your own reasoning residency
for the duration, so a subagent is almost always the better trade.

## Staying anchored

The same drift risk opus-on-call names applies in mirror: `SKILL.md` loads
once, at invocation, then sits atop a context that only grows, and its pull
fades the same way regardless of which model is reading it. The failure mode
here is convenience, not misplaced judgment — "it's just a quick edit, I'll
do it myself" repeated fifty times over a session reintroduces exactly the
bulk this skill exists to keep out.

- **Self-check.** Before finalizing a response where you did non-trivial
  mechanical or bulk work yourself, ask: *did that belong to a Sonnet
  delegation instead?* A yes means route the next one rather than rationalizing
  the miss.
- **Loop check.** After the second turn-by-turn repetition of the same kind of
  mechanical step, stop and batch the rest into one delegation (see Route by
  task).
- **Re-injection.** This plugin ships a `UserPromptSubmit` hook that re-states
  the routing rule each turn while the mode is active (turned on by invoking
  `/sonnet-on-call`, cleared by `/sonnet-on-call off`). Keep it enabled — it's
  the one signal that comes from outside the growing context.

## Discipline

- **Mechanical/execution hops (→ Sonnet): lean toward spinning up.** An
  unnecessary Sonnet hop is a bounded, cheap burst; an unnecessary chunk of
  mechanical noise in your own context taxes every remaining turn at the
  resident rate. Batch related mechanical steps into one subagent call for
  coherence, not to ration hop count. Never grind through bulky or repetitive
  work yourself just to avoid spinning one up.
- **Trivial one-shot lookups: just do them.** If a single targeted Read, Grep,
  Glob, or short command already answers it in a few lines, running it
  yourself costs less turn-time than spin-up + context re-init for a subagent,
  and the output is too small to matter to your context budget either way.
  The line is output volume, not "is this beneath me": a three-line grep
  result is fine inline; the same grep across the whole repo is not.
- Subagents cannot ask the user questions mid-run — brief them fully.
- Reserve your own (resident) turns for reasoning and continuity — never for
  search or bulk mechanical extraction.
