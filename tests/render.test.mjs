import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractFinalText, extractSessionId, parseReviewJson, renderJobsTable, renderReview } from '../plugins/kimi/scripts/lib/render.mjs';

test('extracts the last assistant text from stream-json (message.content blocks)', () => {
  const raw = [
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'first answer' }] } }),
    JSON.stringify({ type: 'tool_call', name: 'Bash' }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'final answer' }] } }),
  ].join('\n');
  assert.equal(extractFinalText(raw), 'final answer');
});

test('handles string content and role-only shapes', () => {
  const raw = [
    JSON.stringify({ role: 'assistant', content: 'plain string answer' }),
    JSON.stringify({ type: 'assistant', content: 'typed string answer' }),
  ].join('\n');
  assert.equal(extractFinalText(raw), 'typed string answer');
});

test('skips malformed and non-JSON lines', () => {
  const raw = [
    'not json at all',
    '{"type":"assistant","content":"good"',
    '{"unrelated":true}',
    JSON.stringify({ type: 'assistant', content: 'survived' }),
    '',
  ].join('\n');
  assert.equal(extractFinalText(raw), 'survived');
});

test('ignores empty assistant messages and keeps the last non-empty one', () => {
  const raw = [
    JSON.stringify({ type: 'assistant', content: 'real answer' }),
    JSON.stringify({ type: 'assistant', content: [] }),
    JSON.stringify({ type: 'assistant', content: '' }),
  ].join('\n');
  assert.equal(extractFinalText(raw), 'real answer');
});

test('falls back to raw text when no assistant message exists', () => {
  const raw = 'plain foreground output\nover two lines\n';
  assert.equal(extractFinalText(raw), 'plain foreground output\nover two lines');
});

test('extractSessionId finds common field shapes', () => {
  assert.equal(extractSessionId('{"session_id":"s-1"}'), 's-1');
  assert.equal(extractSessionId('{"sessionId":"s-2"}'), 's-2');
  assert.equal(extractSessionId('{"session":{"id":"s-3"}}'), 's-3');
  assert.equal(extractSessionId('{"type":"assistant","content":"hi"}'), null);
});

test('extractSessionId falls back to the plain-text resume hint', () => {
  const raw = 'Some review output\n\nTo resume this session: kimi -r session_cb479423-1706-4729-a0aa-676072a94a8a\n';
  assert.equal(extractSessionId(raw), 'session_cb479423-1706-4729-a0aa-676072a94a8a');
  assert.equal(extractSessionId('continue with kimi --session 01HZXYZ'), '01HZXYZ');
  assert.equal(extractSessionId('no hint here'), null);
});

test('renderJobsTable renders header, separator, and rows', () => {
  const table = renderJobsTable([
    {
      id: 'task-abc-1234',
      cmd: 'review',
      status: 'completed',
      pid: 999,
      startedAt: '2026-01-01T00:00:00.000Z',
      endedAt: '2026-01-01T00:00:30.000Z',
    },
  ]);
  const lines = table.split('\n');
  assert.match(lines[0], /ID\s+COMMAND\s+STATUS\s+PID\s+STARTED\s+DURATION/);
  assert.match(lines[1], /^-+/);
  assert.match(lines[2], /task-abc-1234\s+review\s+completed\s+999/);
  assert.match(lines[2], /30s/);
});

test('renderJobsTable handles an empty list', () => {
  assert.equal(renderJobsTable([]), 'No jobs found.');
});

const REVIEW_JSON = JSON.stringify({
  verdict: 'needs-attention',
  summary: 'Two problems.',
  findings: [
    {
      severity: 'high',
      title: 'Swallowed error',
      body: 'The catch block drops the error.',
      file: 'src/a.mjs',
      line_start: 10,
      line_end: 12,
      confidence: 0.9,
      recommendation: 'Log or rethrow.',
    },
  ],
  next_steps: ['Add a regression test'],
});

test('parseReviewJson reads the last fenced json block', () => {
  const text = `Some prose.\n\n\`\`\`json\n{"verdict":"approve","findings":[]}\n\`\`\`\n\nMore prose.\n\n\`\`\`json\n${REVIEW_JSON}\n\`\`\``;
  const review = parseReviewJson(text);
  assert.equal(review.verdict, 'needs-attention');
  assert.equal(review.findings.length, 1);
});

test('parseReviewJson accepts bare JSON text as a fallback', () => {
  assert.equal(parseReviewJson(REVIEW_JSON).verdict, 'needs-attention');
});

test('parseReviewJson returns null for prose and malformed blocks', () => {
  assert.equal(parseReviewJson('no json here'), null);
  assert.equal(parseReviewJson('```json\n{broken\n```'), null);
  assert.equal(parseReviewJson('{"unrelated":true}'), null);
});

test('renderReview orders findings by severity and includes sections', () => {
  const review = JSON.parse(REVIEW_JSON);
  review.findings.push({
    severity: 'critical',
    title: 'Data loss',
    body: 'Overwrite without backup.',
    file: 'src/b.mjs',
    line_start: 3,
    line_end: 4,
    confidence: 0.8,
    recommendation: 'Write to a temp file first.',
  });
  const out = renderReview(review);
  assert.match(out, /^Verdict: needs-attention/);
  assert.ok(out.indexOf('critical') < out.indexOf('high'), 'critical sorts before high');
  assert.match(out, /src\/a\.mjs:10 — Swallowed error/);
  assert.match(out, /Next steps:\n- Add a regression test/);
});

test('renderReview renders the empty-findings case', () => {
  const out = renderReview({ verdict: 'approve', summary: 'Clean.', findings: [], next_steps: [] });
  assert.match(out, /No issues found\./);
});
