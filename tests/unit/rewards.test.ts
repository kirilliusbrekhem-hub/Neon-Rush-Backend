import { calculateOopsReward } from '../../src/modules/rewards/rewards.service';

describe('calculateOopsReward', () => {
  it('splits the pool proportionally to player rush share', () => {
    const reward = calculateOopsReward({
      playerRush: 250,
      totalSeasonRush: 1000,
      rewardPool: 10000,
      maxOopsPerPlayer: 100000,
    });
    expect(reward).toBeCloseTo(2500);
  });

  it('caps the reward at max_oops_per_player', () => {
    const reward = calculateOopsReward({
      playerRush: 900,
      totalSeasonRush: 1000,
      rewardPool: 10000,
      maxOopsPerPlayer: 1000,
    });
    expect(reward).toBe(1000);
  });

  it('returns 0 when total season rush is 0 (no divide-by-zero)', () => {
    const reward = calculateOopsReward({
      playerRush: 0,
      totalSeasonRush: 0,
      rewardPool: 10000,
      maxOopsPerPlayer: 1000,
    });
    expect(reward).toBe(0);
  });

  it('returns 0 when reward pool is 0', () => {
    const reward = calculateOopsReward({
      playerRush: 500,
      totalSeasonRush: 1000,
      rewardPool: 0,
      maxOopsPerPlayer: 1000,
    });
    expect(reward).toBe(0);
  });
});
