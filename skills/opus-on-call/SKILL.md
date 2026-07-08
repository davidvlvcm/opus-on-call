---
name: opus-on-call
description: >
  Cost-efficient model-routing playbook. Runs the main session as a Sonnet
  orchestrator that does mechanical work inline, offloads noisy tool output to
  cheap summarizer subagents, and delegates scoped reasoning to short-lived Opus
  subagents that return a spec. Manual-only; invoke with /opus-on-call.
model: sonnet
---

# Sonnet Does, Opus Decides

Adopt cost-efficient orchestration for this session.

Why: the dominant token cost is `cache_read` — the accumulating context re-read on every turn, priced per model. Keep the long-lived main context on the cheap model; let the expensive model touch only small, isolated problems; keep bulky/noisy tool output out of the main context entirely.

## Your role (main agent)

- You are the **Sonnet orchestrator** — this skill pins `model: sonnet` while active, so it's enforced, not convention.
- Do mechanical work inline.
- Delegate reasoning to **Opus subagents**. They run in isolated context and return only their final message, so your main context stays lean.
- Delegate noisy/bulky mechanical output (verbose command output, large reads) to **Sonnet or Haiku subagents** that return a short summary instead of raw content.
- Keep the main thread small: targeted reads, CKG line-ranges, and delegation over pulling large content inline.

## Route by task

**Default: if a task carries any judgment, escalate it.** Inline is the narrow exception — it applies only to the mechanical allowlist below. When you can't cleanly place a task, that uncertainty *is* the signal: escalate.

An Opus subagent runs in isolated context and returns only its final message, so even an unnecessary one costs a single bounded burst and never touches the main `cache_read`. That is far cheaper than the failure it prevents — reasoning inline on Sonnet when the task deserved Opus. Bias to the cheap mistake.

**Mechanical allowlist — inline (Sonnet), do not escalate:**
- edits, refactors, mechanical or repetitive changes
- git/build/test ops and running commands whose output is already small or structured
- applying an already-decided plan or spec
- "find / check X" lookups
- anything you can filter yourself in one shell command (`grep`, `jq`, `| tail`)

**Everything else → Opus:**
- architecture and design trade-offs
- ambiguous requirements needing judgment
- tricky multi-file debugging (root-cause reasoning)
- review judgment / risk calls
- any moment you catch yourself about to "just think through" a non-trivial call inline

Route a judgment task by whether it packages:
- **Packageable** — a self-contained prompt can carry it → **Opus subagent** (recipe below).
- **Context-entangled** — it leans on so much live session state that packaging would lose too much → **ask the user to `/model opus`** for that burst (see Context-entangled decisions).

**Live diagnostic loops are root-cause debugging even when no single step looks like it.** A debugging *loop* emerges turn by turn as "run one more command to test this hypothesis," and each turn passes the mechanical allowlist on its own; the aggregate is the root-cause reasoning this section sends to Opus. Trigger, fired mid-turn: the second time you run a command whose only purpose is to test a hypothesis about *why* something failed (not to make forward progress), stop before a third probe — package the open question (what's failed, what you've ruled out, what you'd try next) and delegate the rest. Here, loosen the target: the goal is keeping the noisy back-and-forth off the main `cache_read`, not the model tier. A default-model subagent that can itself escalate to Opus is fine — "own this investigation, run whatever diagnostics you need in your own context, return a root cause + fix."

## Escalation recipe — Opus decision subagent

Spawn via the Agent tool with `model: opus` and `subagent_type` = `Plan` (implementation strategy) or `general-purpose` (a decision). The subagent starts blank and cannot see this session, so the prompt must be self-contained:

1. The problem and the exact decision needed.
2. All context it needs — file paths, constraints, prior decisions.
3. The candidate options, if known.
4. Instruct it to explore in **its own** context and return: the decision + a crisp spec/steps + rationale. No file dumps.

Then execute the returned spec inline.

## Bulk/noisy mechanical output → summarizer subagent

Some inline work is mechanical but produces output too large to filter with a shell pipe: a verbose test run, a huge log tail, a big diff, a wide grep.

- Spawn via the Agent tool with `model: sonnet` by default. Use `model: haiku` only when extraction needs no judgment (e.g. "did the build pass, list failing test names verbatim"). Use Sonnet when picking signal from noise needs judgment (e.g. "which lint warnings are worth fixing now").
- Tell it exactly what to run/read and the exact shape of the answer (pass/fail, counts, top N errors with file:line). Explicitly instruct it not to return raw output.

## Search / exploration

Fan-out search → `Explore` (or `general-purpose`) on **Haiku or Sonnet**. Never Opus — no reasoning required. Findings stay in the subagent's context instead of bloating yours.

## Effort levels

Effort (`low`/`medium`/`high`/`xhigh`/`max`) is a separate lever from model choice — it controls thinking-token budget for whichever model is running. Configurable via `/effort`, `CLAUDE_CODE_EFFORT_LEVEL`, or an `effort:` frontmatter field.

- This skill does not pin `effort:`. The orchestrator needs full reasoning to classify tasks and write self-contained subagent prompts — capping that would degrade routing.
- For a heads-down mechanical stretch in the main thread, drop to `/effort low` yourself rather than assuming a subagent hop is cheaper — spin-up and context re-init aren't free.
- A spawned subagent inherits the parent session's current effort level (like model), so there's no per-call knob to set for the common case.
- For a genuinely deep-reasoning Opus decision subagent, run `/effort max` immediately before spawning, then drop back after it returns. The bump is session-wide, so it costs max-rate on your own turns while set — bump right before the spawn, revert right after.

## Context-entangled decisions

If a decision depends on so much live session state that packaging would lose too much, ask the user to `/model opus` for that burst, then `/model sonnet` back — you cannot switch your own model. Trade-off: full fidelity, but pays the Opus rate on the whole context for those turns.

## Staying anchored

This skill loads once, at invocation, then sits atop a context that only grows — so its pull fades over a long session and the failure is silent: you slide back to reasoning inline without noticing. Two backstops:

- **Self-check.** Before finalizing any response where you worked through a non-trivial decision, ask: *did I just reason inline on something that belonged to the escalate default?* A yes means route the next such task.
- **Re-injection.** This plugin ships a `UserPromptSubmit` hook that re-states the routing rule each turn while the mode is active (turned on by `/opus-on-call`, cleared by `/opus-on-call off`). Only re-injection from outside the growing context reliably re-anchors. Keep the hook enabled.

## Discipline

Two kinds of hop pull in opposite directions:

- **Reasoning hops (→ Opus): lean toward spinning up.** The isolated burst is cheap, and not reasoning inline on Sonnet is the whole point. *Batch* genuinely-related questions into one subagent for fidelity — but batching is for coherence, not frequency-rationing. Never skip, defer, or downgrade a needed escalation to hold the hop count down.
- **Mechanical / summarizer / search hops: a pipe beats a subagent.** Spin-up + context re-init often exceeds the work itself. Don't spawn a subagent for what `grep`/`jq`/`| tail` does inline; deterministic data crunching → write a script.
- Subagents cannot ask the user questions mid-run; give them enough to not block.
