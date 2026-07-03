#!/usr/bin/env node
// opus-on-call — UserPromptSubmit hook.
//
// Re-anchors the routing rule. SKILL.md loads once at invocation and then sits
// atop a context that only grows, so its pull fades over a long session and the
// orchestrator silently drifts back to reasoning inline on Sonnet. This hook
// re-states the rule on every turn — the one place re-injection can come from
// outside the growing context.
//
// The skill is manual-only (disable-model-invocation: true), so the reminder
// must fire ONLY in sessions where the user invoked /opus-on-call. Gate on a
// per-session flag file, never a global one — a global flag would leak the
// reminder into unrelated concurrent sessions and persist after this one ends.

const fs = require('fs');
const path = require('path');
const os = require('os');

const claudeDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
const flagDir = path.join(claudeDir, '.opus-on-call');
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

// The routing rule, re-stated each turn. Kept tight — it rides every user turn,
// and bloating the reminder undercuts the token saving the whole skill exists for.
const REMINDER =
  'opus-on-call routing active. Default: delegate any task carrying judgment ' +
  '(architecture, ambiguous requirements, multi-file root-cause debugging, review/risk calls) ' +
  'to a short-lived Opus subagent (Agent tool, model: opus) that returns a spec. ' +
  'Stay inline on Sonnet only for the mechanical allowlist: edits, git/build/test, ' +
  'applying an already-decided spec, lookups, one-shell-command filters. ' +
  'When unsure, escalate — a spurious isolated Opus burst is cheaper than reasoning inline on Sonnet. ' +
  'Context-entangled decision (too much live state to package) → ask the user to /model opus, not a subagent. ' +
  'Never Opus for search or mechanical extraction.';

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
      /\/opus-on-call(:opus-on-call)?\s+(off|stop|end|disable)\b/.test(prompt) ||
      /\b(stop|disable|deactivate|turn off)\b.*\bopus-on-call\b/.test(prompt);
    const isOn =
      /^\/opus-on-call(:opus-on-call)?\b/.test(prompt) ||
      /\b(activate|enable|turn on|start)\b.*\bopus-on-call\b/.test(prompt);

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
