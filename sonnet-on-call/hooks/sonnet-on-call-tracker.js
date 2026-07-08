#!/usr/bin/env node
// sonnet-on-call — UserPromptSubmit hook.
//
// Re-anchors the routing rule. SKILL.md loads once at invocation and then sits
// atop a context that only grows, so its pull fades over a long session the
// same way regardless of which model is resident. Here the drift is toward
// convenience — doing mechanical work yourself instead of delegating it — so
// this hook re-states the rule on every turn, the one place re-injection can
// come from outside the growing context.
//
// The skill is manual-only by convention (not by a disable-model-invocation
// flag — that flag currently dead-ends the typed slash command on Claude
// Code), so the reminder must fire ONLY in sessions where the user invoked
// /sonnet-on-call. Gate on a per-session flag file, never a global one — a
// global flag would leak the reminder into unrelated concurrent sessions and
// persist after this one ends.

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagDir = path.join(claudeDir, '.sonnet-on-call');
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

// The routing rule, re-stated each turn. Kept tight — it rides every user turn
// at the resident (expensive) rate, and bloating the reminder undercuts the
// context-hygiene saving the whole skill exists for.
const REMINDER =
  "sonnet-on-call active. You're the resident thinker (Opus/Fable) — " +
  'stay inline for reasoning, architecture, and anything needing this session\'s ' +
  'continuity. Delegate mechanical execution (edits once decided, git/build/test ' +
  'loops, repetitive/batch changes) to a Sonnet subagent (Agent tool, model: sonnet). ' +
  'Delegate noisy or bulky output (verbose logs, large diffs/reads, wide greps) ' +
  'to a Sonnet/Haiku summarizer that returns a compact verdict, never raw content. ' +
  'Search/exploration always goes to Explore or general-purpose on Haiku/Sonnet, ' +
  'never inline. Repetitive mechanical steps: batch the rest into one delegation ' +
  'instead of grinding turn by turn.';

// Session id scopes the flag. It's a server UUID, but sanitize anyway so a
// malformed value can't escape flagDir via path separators.
function flagPathFor(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) return null;
  const safe = sessionId.replace(/[^A-Za-z0-9_-]/g, '');
  if (!safe) return null;
  return path.join(flagDir, 'active-' + safe);
}

// Symlink-safe create. Refuses a symlinked parent or target so a local attacker
// can't redirect the predictable flag path to clobber another file, then writes
// atomically via temp + rename. Best-effort: silent-fails on any fs error.
function activate(flagPath) {
  try {
    fs.mkdirSync(flagDir, { recursive: true });
    try {
      if (fs.lstatSync(flagDir).isSymbolicLink()) return;
    } catch (e) { return; }
    try {
      if (fs.lstatSync(flagPath).isSymbolicLink()) return;
    } catch (e) {
      if (e.code !== 'ENOENT') return;
    }
    const tempPath = path.join(flagDir, `.tmp.${process.pid}.${Date.now()}`);
    const O_NOFOLLOW = typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0;
    const flags = fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | O_NOFOLLOW;
    let fd;
    try {
      fd = fs.openSync(tempPath, flags, 0o600);
      fs.writeSync(fd, String(Date.now()));
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
    fs.renameSync(tempPath, flagPath);
  } catch (e) { /* best-effort */ }
}

function deactivate(flagPath) {
  try { fs.unlinkSync(flagPath); } catch (e) { /* absent already */ }
}

// A regular (non-symlink) flag file means the mode is on for this session.
// Existence is the whole signal — content is never read into context, so this
// hook only ever injects the fixed REMINDER it controls, never file bytes.
function isActive(flagPath) {
  try {
    const st = fs.lstatSync(flagPath);
    return st.isFile() && !st.isSymbolicLink();
  } catch (e) {
    return false;
  }
}

// Per-session flags are never explicitly cleaned when a session just ends, so
// sweep stale ones to keep the dir from growing without bound.
function sweepStale() {
  try {
    const now = Date.now();
    for (const name of fs.readdirSync(flagDir)) {
      if (!name.startsWith('active-')) continue;
      const p = path.join(flagDir, name);
      try {
        if (now - fs.lstatSync(p).mtimeMs > STALE_MS) fs.unlinkSync(p);
      } catch (e) { /* skip */ }
    }
  } catch (e) { /* dir absent — nothing to sweep */ }
}

let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const flagPath = flagPathFor(data.session_id);
    if (!flagPath) return; // no session id → can't scope; stay silent rather than leak globally

    const prompt = (data.prompt || '').trim().toLowerCase();

    const isOff =
      /\/sonnet-on-call(:sonnet-on-call)?\s+(off|stop|end|disable)\b/.test(prompt) ||
      /\b(stop|disable|deactivate|turn off)\b.*\bsonnet-on-call\b/.test(prompt);
    const isOn =
      /^\/sonnet-on-call(:sonnet-on-call)?\b/.test(prompt) ||
      /\b(activate|enable|turn on|start)\b.*\bsonnet-on-call\b/.test(prompt);

    if (isOff) deactivate(flagPath);
    else if (isOn) activate(flagPath);

    sweepStale();

    if (isActive(flagPath)) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext: REMINDER
        }
      }));
    }
  } catch (e) {
    // Silent fail — a hook must never break the turn.
  }
});
