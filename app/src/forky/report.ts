/**
 * Reporting an Ask Forky answer (Google Play's AI-generated-content policy: an in-app way to flag
 * harmful or offensive AI output). No backend and no stored report: the report is an email to
 * support, written by the person's own mail app. It carries the reason, the optional note and the
 * answer text, and nothing about the person (no email, name, pantry or question history).
 */
import { SUPPORT_EMAIL } from '../account/copy';

export const REPORT_REASONS = [
  { id: 'harmful', label: 'Harmful or unsafe' },
  { id: 'allergen', label: 'Wrong allergen or food-safety info' },
  { id: 'offensive', label: 'Offensive' },
  { id: 'other', label: 'Other' },
] as const;

export type ReportReasonId = (typeof REPORT_REASONS)[number]['id'];

export const REPORT_NOTE_MAX = 300;
/** Long answers are cut so the mailto link stays short enough for every mail app. */
export const REPORT_ANSWER_MAX = 1500;

export const REPORT_COPY = {
  control: 'Report this answer',
  title: 'Report this answer',
  reasonLabel: 'What is wrong with it?',
  noteLabel: 'Anything to add? (optional)',
  send: 'Send report',
  cancel: 'Cancel',
  done: 'Thanks, we got your report',
  close: 'Close',
  subject: 'Ask Forky answer report',
} as const;

export function reasonLabel(id: ReportReasonId): string {
  return REPORT_REASONS.find((r) => r.id === id)?.label ?? 'Other';
}

export function buildReportMailto(input: { reason: ReportReasonId; note?: string; answer: string }): string {
  const note = (input.note ?? '').trim().slice(0, REPORT_NOTE_MAX);
  const answer = input.answer.trim();
  const shown = answer.length > REPORT_ANSWER_MAX ? `${answer.slice(0, REPORT_ANSWER_MAX)}…` : answer;
  const body = [`Reason: ${reasonLabel(input.reason)}`, `Note: ${note || '(none)'}`, '', 'Forky answer:', shown].join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(REPORT_COPY.subject)}&body=${encodeURIComponent(body)}`;
}
