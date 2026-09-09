import { validateAndComputeRush, GAME_RULES } from '../../src/modules/sessions/validation';

function secondsAgo(s: number) {
  return new Date(Date.now() - s * 1000);
}

describe('validateAndComputeRush', () => {
  it('accepts a plausible session and awards rush', () => {
    const result = validateAndComputeRush({
      startedAt: secondsAgo(30),
      endedAt: new Date(),
      clientReportedScore: 100,
    });
    expect(result.valid).toBe(true);
    expect(result.rushAwarded).toBe(10);
  });

  it('rejects sessions shorter than the minimum duration', () => {
    const result = validateAndComputeRush({
      startedAt: secondsAgo(1),
      endedAt: new Date(),
      clientReportedScore: 50,
    });
    expect(result.valid).toBe(false);
    expect(result.rushAwarded).toBe(0);
    expect(result.notes.reason).toBe('session_too_short');
  });

  it('rejects sessions longer than the maximum duration', () => {
    const result = validateAndComputeRush({
      startedAt: secondsAgo(GAME_RULES.MAX_SESSION_SECONDS + 60),
      endedAt: new Date(),
      clientReportedScore: 50,
    });
    expect(result.valid).toBe(false);
    expect(result.notes.reason).toBe('session_too_long');
  });

  it('clamps an implausibly high client score to the max plausible score for the duration', () => {
    const result = validateAndComputeRush({
      startedAt: secondsAgo(10),
      endedAt: new Date(),
      clientReportedScore: 1_000_000,
    });
    expect(result.valid).toBe(true);
    expect(result.notes.clamped).toBe(true);
    expect(result.rushAwarded).toBe(50);
  });

  it('never awards more than MAX_RUSH_PER_SESSION even for a maximal legit session', () => {
    const result = validateAndComputeRush({
      startedAt: secondsAgo(GAME_RULES.MAX_SESSION_SECONDS),
      endedAt: new Date(),
      clientReportedScore: GAME_RULES.MAX_SESSION_SECONDS * GAME_RULES.MAX_SCORE_PER_SECOND,
    });
    expect(result.rushAwarded).toBeLessThanOrEqual(GAME_RULES.MAX_RUSH_PER_SESSION);
  });

  it('rejects a negative score', () => {
    const result = validateAndComputeRush({
      startedAt: secondsAgo(30),
      endedAt: new Date(),
      clientReportedScore: -5,
    });
    expect(result.valid).toBe(false);
    expect(result.notes.reason).toBe('invalid_score_value');
  });
});
