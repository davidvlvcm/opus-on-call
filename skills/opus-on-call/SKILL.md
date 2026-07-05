---
name: opus-on-call
description: >
  Cost-efficient model-routing playbook. Runs the main session as a Sonnet
  orchestrator that does mechanical work inline, offloads noisy/bulky tool
  output to cheap summarizer subagents, and delegates scoped reasoning and
  decisions to short-lived Opus subagents that return a spec. Manual-only;
  invoke with /opus-on-call, ideally at the start of a session.
model: sonnet
disable-model-invocation: true
---

# Sonnet Does, Opus Decides

Adopt cost-efficient orchestration for this session.

Why: the dominant token cost is `cache_read` — the accumulating context re-read on every turn — and it is priced per model. Keep the long-lived main context on the cheap model; let the expensive model touch only small, isolated problems; keep bulky/noisy tool output out of the main context entirely.

## Your role (main agent)

- You are the **Sonnet orchestrator** — this skill pins `model: sonnet` for the session while active, so this is enforced, not just a convention.
- Do mechanical work inline.
- Delegate reasoning to **Opus subagents**. They run in isolated context and return only their final message, so your main context stays lean.
- Delegate noisy/bulky mechanical output (verbose command output, large reads) to **Sonnet or Haiku subagents** that return a short summary instead of the raw content.
- Keep the main thread small: targeted reads, CKG line-ranges, and delegation over pulling large content inline.
- When a task sits on the line between mechanical and reasoning, treat it as reasoning and delegate — the default leans to escalation (see Route by task).

## Route by task

**Default: if a task carries any judgment, escalate it.** Inline is the narrow exception — it applies only when the task matches the mechanical allowlist below. When you can't cleanly place a task, that uncertainty *is* the signal: escalate.

Why lean this hard toward escalating: an Opus subagent runs in isolated context and returns only its final message, so even an unnecessary one costs a single bounded burst and never touches the main `cache_read`. That is far cheaper than the failure it prevents — reasoning inline on Sonnet when the task deserved Opus. A false escalation wastes a little; a missed one silently degrades the decision. Bias to the cheap mistake.

**Mechanical allowlist — inline (Sonnet), do not escalate:**
- edits, refactors, mechanical or repetitive changes
- git/build/test ops and running commands whose output is already small or structured
- applying an already-decided plan or spec
- "find / check X" lookups
- anything you can filter yourself in one shell command (`grep`, `jq`, `| tail`) — a hop costs spin-up + context re-init, so don't reach for one when a pipe does the job

**Everything else → Opus.** Treat this list as illustrations of the default, not its boundary:
- architecture and design trade-offs
- ambiguous requirements needing judgment
- tricky multi-file debugging (root-cause reasoning)
- review judgment / risk calls
- any moment you catch yourself about to "just think through" a non-trivial call inline

Route a judgment task by whether it packages:
- **Packageable** — a self-contained prompt can carry it → **Opus subagent** (recipe below).
- **Context-entangled** — it leans on so much live session state that packaging would lose too much → **ask the user to `/model opus`** for that burst (see Context-entangled decisions). Forcing it through a subagent yields a lossy spec and a re-escalation; don't.

**Live diagnostic loops are root-cause debugging even when no single step looks like it.** A debugging *task* gets classified once, up front — but a debugging *loop* emerges turn by turn as "run one more command to test this hypothesis," and each individual turn (run a command, read output, edit a file) passes the mechanical allowlist on its own. The aggregate is the same "tricky multi-file debugging (root-cause reasoning)" this section already sends to Opus; judge the loop's shape, not each step in isolation. Concrete trigger: the second time you run a command whose only purpose is to test a hypothesis about *why something failed* (not to make forward progress on the task itself), stop before running a third probe — package the open question (what's failed so far, what you've ruled out, what you were about to try next) and delegate the rest of the investigation instead of continuing to probe inline.

For this specific case, loosen the delegation target: the goal is keeping the exploratory back-and-forth — and its noisy tool output — off the main thread's `cache_read`, not necessarily upgrading the model tier. A default-model (Sonnet) subagent that can itself escalate to Opus if it hits a genuine judgment call is fine, often cheaper, and still satisfies the escalation. Spawn it as: "own this investigation, run whatever diagnostics you need in your own context, and return a root cause + fix" — model optional, effort inherited — distinct from the Opus-specific recipe below, which is for decisions you can already package without further live probing.

**Delegate to a Sonnet/Haiku summarizer subagent:**
- verbose build/test/lint runs, large diffs, big file reads, sprawling grep/CKG dumps — where the raw content isn't needed, only a verdict or short digest
- search / codebase exploration (`Explore` or `general-purpose`)

## Escalation recipe — Opus decision subagent

Spawn via the Agent tool with `model: opus` and `subagent_type` = `Plan` (implementation strategy) or `general-purpose` (a decision). The subagent starts blank and cannot see this session, so the prompt must be self-contained:

1. The problem and the exact decision needed.
2. All context it needs — file paths, constraints, prior decisions.
3. The candidate options, if known.
4. Instruct it to explore in **its own** context and return: the decision + a crisp spec/steps + rationale. No file dumps.

Then execute the returned spec inline.

## Bulk/noisy mechanical output → summarizer subagent

Some inline work is mechanical but produces output too large or unstructured to filter with a shell pipe: a verbose test run, a huge log tail, a big diff, a wide grep across the repo.

- Spawn via the Agent tool with `model: sonnet` by default. Use `model: haiku` only when the extraction needs no judgment at all (e.g. "did the build pass, list failing test names verbatim"). Use Sonnet when picking signal from noise needs some judgment (e.g. "which of these lint warnings are worth fixing now").
- Tell the subagent exactly what to run/read and the exact shape of the answer you need (pass/fail, counts, top N errors with file:line). Explicitly instruct it not to return the raw output.
- This is distinct from the search route below in intent, not mechanics: search subagents locate code; summarizer subagents run or read something you already know the location of and compress its output. Both are cheap, non-reasoning delegations and can share the same agent types.

## Search / exploration

Fan-out search → `Explore` (or `general-purpose`) on **Haiku or Sonnet**. Never Opus for search — no reasoning required. Findings stay in the subagent's context instead of bloating yours.

## Effort levels

Effort (`low`/`medium`/`high`/`xhigh`/`max`) is a separate lever from model choice — it controls thinking-token budget for whichever model is running. Configurable via `/effort`, `CLAUDE_CODE_EFFORT_LEVEL`, or an `effort:` frontmatter field on a skill or subagent definition.

- This skill does not pin `effort:` in its own frontmatter. The orchestrator still needs full reasoning to classify tasks and write self-contained subagent prompts — capping that would degrade routing quality, not just cost.
- For a heads-down mechanical stretch (batch renames, applying an already-decided spec) in the main thread, drop to `/effort low` yourself rather than assuming a subagent hop is automatically cheaper — spin-up and context re-init aren't free either.
- The Agent tool has no per-call effort parameter (open upstream requests: anthropics/claude-code#25669, #25591, #43083). Instead, **a spawned subagent inherits the parent session's current effort level**, the same way it inherits the session model unless `model:` overrides it. There is no separate per-agent effort default — no per-call knob is needed for the common case, inheritance already does it.
- To get a genuinely deep-reasoning Opus decision subagent (not just default/high effort), run `/effort max` in the main session immediately before spawning it, then drop back (`/effort low`/`auto`) once it returns. This costs max-rate on your own turns too while set, since the bump is session-wide, not scoped to the subagent — bump right before the spawn and revert right after to limit exposure.

## Context-entangled decisions

If a decision depends on so much live session state that packaging it would lose too much, ask the user to `/model opus` for that burst, then `/model sonnet` back — you cannot switch your own model. Trade-off: full fidelity, but pays the Opus rate on the whole context for those turns.

## Staying anchored

This skill loads once, when you invoke it, then sits at the top of a context that only grows — so its pull fades over a long session and the failure is silent: you slide back to reasoning inline without noticing. Two backstops:

- **Self-check.** Before finalizing any response where you worked through a non-trivial decision, ask: *did I just reason inline on something that belonged to the escalate default?* A yes means you've drifted — route the next such task instead of rationalizing the miss.
- **Diagnostic-loop check.** This one fires mid-turn, not just at the end. After any turn where you ran a command purely to test a hypothesis about why something failed, ask: *is this the second such probe in a row?* If yes, that's the drift signal — don't wait for the end-of-response self-check, package the investigation and delegate it now (see Route by task).
- **Re-injection.** This plugin ships a `UserPromptSubmit` hook that re-states the routing rule each turn while the mode is active (turned on by invoking `/opus-on-call`, cleared by `/opus-on-call off`). The self-check decays along with everything else; only re-injection from outside the growing context reliably re-anchors. Keep the hook enabled.

## Discipline

Two kinds of hop pull in opposite directions — don't let the caution for one bleed onto the other:

- **Reasoning hops (→ Opus): lean toward spinning up.** The isolated burst is cheap, and not reasoning inline on Sonnet is the entire point. *Batch* genuinely-related questions into one subagent for fidelity — but batching is for coherence, not frequency-rationing. Never skip, defer, or downgrade a needed escalation just to hold the hop count down.
- **Mechanical / summarizer / search hops: a pipe beats a subagent.** Here spin-up + context re-init is real overhead that often exceeds the work itself. Don't spawn a subagent for what `grep`/`jq`/`| tail` does inline; deterministic data crunching (parsing, counting, aggregation) → write a script.

- Subagents cannot ask the user questions mid-run; give them enough to not block.
- Reserve Opus subagents for reasoning — never for search or mechanical extraction.
