// https://jestjs.io/docs/getting-started

import { StakingPool, now, POOL_ID } from './pool';
import { Token } from './token';

describe('StakingPool', () => {
  let pool: StakingPool;
  const usd = new Token();
  const eth = new Token();
  const rewardPerSecond = 1;
  const start = now() + 1;
  const lockDuration = 300;
  const end = start + lockDuration;

  const userId1 = 'Ux001';
  const userId2 = 'Ux002';
  const stakeAmount = 1000;

  beforeAll(() => {
    expect(() => usd.mint(userId1, 0)).toThrow('Invalid amount');
    expect(() => usd.transfer(userId1, userId2, 0)).toThrow('Invalid amount');
    expect(() => usd.transfer(userId1, userId2, 1)).toThrow('Insufficient balance');
    usd.mint(userId1, stakeAmount);
    usd.mint(userId2, stakeAmount);
    usd.mint(userId2, stakeAmount);
    expect(usd.balanceOf[userId1]).toBe(stakeAmount);
    expect(usd.balanceOf[userId2]).toBe(stakeAmount * 2);

    pool = new StakingPool(usd, eth, rewardPerSecond, start, end, lockDuration);
  });

  it('UserId1 deposits to pool at beginning', () => {
    pool.pause(true);
    expect(() => pool.depositTokens(userId1, stakeAmount)).toThrow('Deposit is frozen');
    pool.pause(false);

    expect(() => pool.depositTokens(userId1, stakeAmount)).toThrow('Invalid time');
    // Move time to start pool
    jest.useFakeTimers({ now: start * 1000 });
    pool.depositTokens(userId1, stakeAmount / 2);
    pool.depositTokensWithId(userId1, stakeAmount / 2, 0);
    expect(() => pool.depositTokens(userId1, 0)).toThrow('Invalid amount');

    const userInfos = pool.userInfos[userId1];
    expect(userInfos.totalAmount).toBe(stakeAmount);
    expect(userInfos.nextDepositId).toBe(1);
    expect(usd.balanceOf[userId1]).toBe(0);
    expect(usd.balanceOf[POOL_ID]).toBe(stakeAmount);
  });

  it('UserId2 deposits to pool after 100 seconds', () => {
    // Move time to 100 seconds
    jest.useFakeTimers({ now: (start + 100) * 1000 });

    pool.depositTokens(userId2, stakeAmount);

    const userInfos = pool.userInfos[userId2];
    expect(userInfos.totalAmount).toBe(stakeAmount);
    expect(userInfos.nextDepositId).toBe(1);
    expect(usd.balanceOf[userId2]).toBe(stakeAmount);
    expect(usd.balanceOf[POOL_ID]).toBe(stakeAmount * 2);
  });

  it('UserId2 deposits to pool after 200 seconds', () => {
    // Move time to 200 seconds
    jest.useFakeTimers({ now: (start + 200) * 1000 });

    pool.depositTokens(userId2, stakeAmount);

    const userInfos = pool.userInfos[userId2];
    expect(userInfos.totalAmount).toBe(stakeAmount * 2);
    expect(userInfos.nextDepositId).toBe(2);
    expect(usd.balanceOf[userId2]).toBe(0);
    expect(usd.balanceOf[POOL_ID]).toBe(stakeAmount * 3);
  });

  it('UserId1 withdraws from pool', () => {
    // Move time to end of deposit 1
    jest.useFakeTimers({ now: (end + 1) * 1000 });

    const pendingReward = pool.pendingReward(userId1, 0);
    // 100 + 0.5 * 100 + 1/3 * 100 = 183.33333333333334
    expect(pendingReward).toBeGreaterThan(183.3333);

    expect(() => pool.withdrawTokens(userId1, stakeAmount, 0)).toThrow('Not enough reward tokens');
    pool.addRewardTokens(rewardPerSecond * lockDuration);

    pool.withdrawTokens(userId1, stakeAmount, 0);

    const userInfos = pool.userInfos[userId1];
    expect(userInfos.totalAmount).toBe(0);
    const depositInfos = pool.depositInfos[userId1][0];
    expect(depositInfos.amount).toBe(0);
    expect(usd.balanceOf[userId1]).toBe(stakeAmount);
    expect(eth.balanceOf[userId1]).toBe(Math.round(pendingReward * 1e4) / 1e4);
  });

  it('UserId2 withdraws from pool', () => {
    pool.pause(true);
    expect(() => pool.withdrawTokens(userId2, stakeAmount, 0)).toThrow('Withdraw is frozen');
    pool.pause(false);

    expect(() => pool.withdrawTokens(userId2, 0, 0)).toThrow('Invalid amount');
    expect(() => pool.withdrawTokens(userId2, stakeAmount * 2, 0)).toThrow('Amount to withdraw too high');
    expect(() => pool.withdrawTokens(userId2, stakeAmount, 0)).toThrow('Invalid time to withdraw');

    // Move time to end of deposit 1
    jest.useFakeTimers({ now: pool.depositInfos[userId2][0].lockTo * 1000 });
    pool.withdrawTokens(userId2, stakeAmount, 0);

    // Move time to end of deposit 2
    jest.useFakeTimers({ now: pool.depositInfos[userId2][1].lockTo * 1000 });
    pool.withdrawTokens(userId2, stakeAmount, 1);

    const userInfos = pool.userInfos[userId2];
    expect(userInfos.totalAmount).toBe(0);
    expect(usd.balanceOf[POOL_ID]).toBe(0);
    expect(usd.balanceOf[userId2]).toBe(stakeAmount * 2);
    // 0.5 * 100 + 2/3 * 100 = 116.666666666666667
    expect(eth.balanceOf[userId2]).toBeGreaterThan(116.66);
  });
});

/**
 *  PASS  src/pool.test.ts
 *   StakingPool
 *     ✓ UserId1 deposits to pool at beginning (16 ms)
 *     ✓ UserId2 deposits to pool after 100 seconds (1 ms)
 *     ✓ UserId2 deposits to pool after 200 seconds (1 ms)
 *     ✓ UserId1 withdraws from pool (2 ms)
 *     ✓ UserId2 withdraws from pool (2 ms)
 *
 * ----------|---------|----------|---------|---------|-------------------
 * File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
 * ----------|---------|----------|---------|---------|-------------------
 * All files |     100 |      100 |     100 |     100 |
 *  pool.ts  |     100 |      100 |     100 |     100 |
 *  token.ts |     100 |      100 |     100 |     100 |
 * ----------|---------|----------|---------|---------|-------------------
 * Test Suites: 1 passed, 1 total
 * Tests:       5 passed, 5 total
 * Snapshots:   0 total
 * Time:        0.522 s, estimated 1 s
 */
