/**
 * Server-side anti-cheat rules for Neon Rush game sessions.
 * These are intentionally simple for the MVP but centralised here so
 * they're the single place tuned as real gameplay data comes in.
 */

export const GAME_RULES = {
  MIN_SESSION_SECONDS: 5, // sessions shorter than this can't have produced a legit score
  MAX_SESSION_SECONDS: 60 * 30, // hard cap: 30 minutes, anything longer is rejected
  MAX_SCORE_PER_SECOND: 50, // highest score rate the game design allows
  SCORE_TO_RUSH_RATE: 0.1, // 10 score points = 1 RUSH
  MAX_RUSH_PER_SESSION: 500, // absolute ceiling regardless of score, prevents single-session exploits
} as const;

export interface ValidationInput {
  startedAt: Date;
  endedAt: Date;
  clientReportedScore: number;
}

export interface ValidationResult {
  valid: boolean;
  rushAwarded: number;
  notes: Record<string, unknown>;
}

export function validateAndComputeRush(input: ValidationInput): ValidationResult {
  const durationSeconds = (input.endedAt.getTime() - input.startedAt.getTime()) / 1000;
  const notes: Record<string, unknown> = { durationSeconds, clientReportedScore: input.clientReportedScore };

  if (!Number.isFinite(input.clientReportedScore) || input.clientReportedScore < 0) {
    return { valid: false, rushAwarded: 0, notes: { ...notes, reason: 'invalid_score_value' } };
  }

  if (durationSeconds < GAME_RULES.MIN_SESSION_SECONDS) {
    return { valid: false, rushAwarded: 0, notes: { ...notes, reason: 'session_too_short' } };
  }

  if (durationSeconds > GAME_RULES.MAX_SESSION_SECONDS) {
    return { valid: false, rushAwarded: 0, notes: { ...notes, reason: 'session_too_long' } };
  }

  // The score we actually trust is capped by what's physically possible in this
  // session's duration, regardless of what the client claims.
  const maxPlausibleScore = durationSeconds * GAME_RULES.MAX_SCORE_PER_SECOND;
  const trustedScore = Math.min(input.clientReportedScore, maxPlausibleScore);

  if (trustedScore < input.clientReportedScore) {
    notes.clamped = true;
    notes.maxPlausibleScore = maxPlausibleScore;
  }

  let rushAwarded = Math.floor(trustedScore * GAME_RULES.SCORE_TO_RUSH_RATE);
  rushAwarded = Math.min(rushAwarded, GAME_RULES.MAX_RUSH_PER_SESSION);

  return { valid: true, rushAwarded, notes };
}
