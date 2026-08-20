// Rendering helpers: job tables and stream-json result extraction.
// The stream-json schema is not documented field-by-field, so all parsing
// here is defensive: skip unparseable lines, try the common shapes for
// assistant text, and fall back to raw output when nothing is found.

function textFromContent(content) {
  if (typeof content === 'string' && content.trim()) return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((block) => {
        if (typeof block === 'string') return block;
        if (block && typeof block === 'object') {
          if (typeof block.text === 'string') return block.text;
        }
        return '';
      })
      .filter(Boolean);
    if (parts.length) return parts.join('\n');
  }
  return null;
}

function assistantText(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const candidates = [];
  if (obj.type === 'assistant' || obj.role === 'assistant') candidates.push(obj);
  if (obj.message && typeof obj.message === 'object') {
    if (obj.message.role === 'assistant' || obj.type === 'assistant') {
      candidates.push(obj.message);
    }
  }
  for (const c of candidates) {
    const text = textFromContent(c.content ?? c.text);
    if (text) return text;
  }
  return null;
}

function parseLines(raw) {
  const objs = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try {
      objs.push(JSON.parse(trimmed));
    } catch {
      // malformed line: skip it
    }
  }
  return objs;
}

// The final assistant text of a run is the last non-empty assistant message.
// When no assistant text is found (e.g. the file holds plain text output from
// a foreground run), return the raw text as-is.
export function extractFinalText(raw) {
  let last = null;
  for (const obj of parseLines(raw)) {
    const text = assistantText(obj);
    if (text) last = text;
  }
  return last ?? raw.trim();
}

// Best-effort session id extraction for `kimi --session <id>` continuation.
// Checks stream-json fields first; in plain-text output (foreground runs)
// kimi prints a "To resume this session: kimi -r <id>" hint — grab that too.
export function extractSessionId(raw) {
  for (const obj of parseLines(raw)) {
    const id = obj.session_id ?? obj.sessionId ?? (obj.session && obj.session.id);
    if (typeof id === 'string' && id) return id;
  }
  const match = raw.match(/kimi\s+(?:-r|--resume|--session)\s+([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

// Review jobs are prompted to end with a fenced ```json block conforming to
// schemas/review-output.schema.json. Unlike codex's --output-schema this is a
// prompt-level convention, so parse defensively: try fenced blocks first
// (last one wins), then the whole text, and give up quietly.
export function parseReviewJson(text) {
  const candidates = [...text.matchAll(/```json\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  candidates.push(text);
  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(candidates[i].trim());
      if (obj && typeof obj.verdict === 'string' && Array.isArray(obj.findings)) return obj;
    } catch {
      // not JSON: try the next candidate
    }
  }
  return null;
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

// Pretty-print a parsed review object. Fields beyond verdict/findings are
// optional in practice, so render what exists.
export function renderReview(review) {
  const lines = [];
  lines.push(`Verdict: ${review.verdict}`);
  if (review.summary) lines.push('', review.summary);
  const findings = [...review.findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  if (findings.length) {
    lines.push('', `Findings (${findings.length}):`);
    for (const f of findings) {
      const loc = f.line_start ? `${f.file}:${f.line_start}` : f.file;
      lines.push('', `- [${f.severity}] ${loc} — ${f.title}`);
      if (f.body) lines.push(`  ${f.body}`);
      if (f.recommendation) lines.push(`  Suggestion: ${f.recommendation}`);
    }
  } else {
    lines.push('', 'No issues found.');
  }
  if (Array.isArray(review.next_steps) && review.next_steps.length) {
    lines.push('', 'Next steps:');
    for (const step of review.next_steps) lines.push(`- ${step}`);
  }
  return lines.join('\n');
}

function formatDuration(start, end) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (Number.isNaN(ms) || ms < 0) return '-';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

// Plain-text table of jobs. Columns: ID, COMMAND, STATUS, PID, STARTED, DURATION.
export function renderJobsTable(jobs) {
  if (!jobs.length) return 'No jobs found.';
  const header = ['ID', 'COMMAND', 'STATUS', 'PID', 'STARTED', 'DURATION'];
  const rows = jobs.map((j) => [
    j.id,
    j.cmd,
    j.status,
    String(j.pid ?? '-'),
    j.startedAt,
    formatDuration(j.startedAt, j.endedAt ?? new Date().toISOString()),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const fmt = (cols) => cols.map((c, i) => String(c).padEnd(widths[i])).join('  ').trimEnd();
  return [fmt(header), fmt(widths.map((w) => '-'.repeat(w))), ...rows.map(fmt)].join('\n');
}
