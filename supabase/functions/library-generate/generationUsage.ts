import {
  geminiImageUsdPerMillion,
  geminiTextInputUsdPerMillion,
  geminiTextOutputUsdPerMillion,
} from './config.ts';

export interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export type GenerationUsagePhase = 'author' | 'critic' | 'critic_retry' | 'image';

export interface GenerationUsageCall {
  phase: GenerationUsagePhase;
  model: string;
  usage: GeminiUsageMetadata;
  cost_usd: number;
}

export interface LibraryGenerationUsage {
  calls: GenerationUsageCall[];
  total_cost_usd: number;
  recorded_at: string;
}

export function parseGeminiUsageMetadata(raw: unknown): GeminiUsageMetadata {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  const usage: GeminiUsageMetadata = {};
  if (typeof obj.promptTokenCount === 'number') usage.promptTokenCount = obj.promptTokenCount;
  if (typeof obj.candidatesTokenCount === 'number') {
    usage.candidatesTokenCount = obj.candidatesTokenCount;
  }
  if (typeof obj.totalTokenCount === 'number') usage.totalTokenCount = obj.totalTokenCount;
  return usage;
}

export function estimateTextCallCostUsd(usage: GeminiUsageMetadata): number {
  const prompt = usage.promptTokenCount ?? 0;
  const candidates = usage.candidatesTokenCount ?? 0;
  const inputRate = geminiTextInputUsdPerMillion();
  const outputRate = geminiTextOutputUsdPerMillion();
  return (prompt / 1_000_000) * inputRate + (candidates / 1_000_000) * outputRate;
}

export function estimateImageCallCostUsd(usage: GeminiUsageMetadata): number {
  const tokens =
    usage.totalTokenCount ??
    (usage.promptTokenCount ?? 0) + (usage.candidatesTokenCount ?? 0);
  const rate = geminiImageUsdPerMillion();
  return (tokens / 1_000_000) * rate;
}

export function usageCall(
  phase: GenerationUsagePhase,
  model: string,
  usage: GeminiUsageMetadata,
  kind: 'text' | 'image',
): GenerationUsageCall {
  const cost =
    kind === 'image' ? estimateImageCallCostUsd(usage) : estimateTextCallCostUsd(usage);
  return { phase, model, usage, cost_usd: Math.round(cost * 1_000_000) / 1_000_000 };
}

export function buildLibraryGenerationUsage(calls: GenerationUsageCall[]): LibraryGenerationUsage {
  const total = calls.reduce((sum, call) => sum + call.cost_usd, 0);
  return {
    calls,
    total_cost_usd: Math.round(total * 1_000_000) / 1_000_000,
    recorded_at: new Date().toISOString(),
  };
}
