import { Token } from './token';

export const POOL_ID = 'Px123';

// Return the current time in seconds
export const now = () => {
  return Math.round(Date.now() / 1000);
};

export interface UserInfo {
  totalAmount: number;
  nextDepositId: number;
}

export interface DepositInfo {
  amount: number;
  lockFrom: number;
  lockTo: number;
  rewardDebt: number;
  rewardPending: number;
}

export class StakingPool {
  stakedToken: Token; // Staked token
  rewardToken: Token; // Reward token
  userInfos: { [uid: string]: UserInfo };
  depositInfos: { [uid: string]: { [did: string]: DepositInfo } };
  rewardPerSecond: number; // Reward tokens created per second.
  startTime: number; // The time when Pool mining starts. In seconds
  endTime: number; // The time when Pool mining ends. In seconds
  lockDuration: number; // The locking duration for each deposit package
  lastRewardTime: number; // The time of the last pool update. In seconds
  accTokenPerShare: number; // Accumulated token per share
  totalStakingTokens: number; // Total staking tokens
  totalRewardTokens: number; // Total reward tokens
  paused: boolean; // Pause the pool

  constructor(
    stakedToken: Token,
    rewardToken: Token,
    rewardPerSecond: number,
    startTime: number,
    endTime: number,
    lockDuration: number,
  ) {
    this.stakedToken = stakedToken;
    this.rewardToken = rewardToken;
    this.userInfos = {};
    this.depositInfos = {};
    this.rewardPerSecond = rewardPerSecond;
    this.startTime = startTime;
    this.endTime = endTime;
    this.lockDuration = lockDuration;
    this.lastRewardTime = startTime;
    this.accTokenPerShare = 0;
    this.totalStakingTokens = 0;
    this.totalRewardTokens = 0;
    this.paused = false;
  }

  // Deposit staked tokens. Auto generate deposit id
  depositTokens(staker: string, amount: number) {
    this.depositTokensWithId(staker, amount, Number.MAX_VALUE);
  }

  // Deposit staked tokens with deposit id
  depositTokensWithId(staker: string, amount: number, depositId: number) {
    if (this.paused) throw new Error('Deposit is frozen');
    if (now() < this.startTime || now() > this.endTime) throw new Error('Invalid time');
    if (amount <= 0) throw new Error('Invalid amount');

    this._updatePool();

    // Create default user info if not exists
    if (!this.userInfos[staker]) {
      this.userInfos[staker] = { totalAmount: 0, nextDepositId: 0 };
    }

    const user = this.userInfos[staker];
    if (depositId >= user.nextDepositId) {
      depositId = user.nextDepositId++;
    }

    // Create default deposit info if not exists
    if (!this.depositInfos[staker]) {
      this.depositInfos[staker] = {};
    }
    // Create new deposit info
    if (!this.depositInfos[staker][depositId]) {
      this.depositInfos[staker][depositId] = {
        amount: 0,
        lockFrom: 0,
        lockTo: 0,
        rewardDebt: 0,
        rewardPending: 0,
      };
    }

    const deposit = this.depositInfos[staker][depositId];
    if (deposit.amount > 0) {
      deposit.rewardPending += deposit.amount * this.accTokenPerShare - deposit.rewardDebt;
    }

    this.stakedToken.transfer(staker, POOL_ID, amount);

    user.totalAmount += amount;
    this.totalStakingTokens += amount;

    deposit.amount += amount;
    deposit.lockFrom = now();
    deposit.lockTo = now() + this.lockDuration;
    deposit.rewardDebt = deposit.amount * this.accTokenPerShare;
    console.log(`Deposit ${staker}, ${amount}, ${depositId}`);
  }

  // Withdraw staked tokens and collect reward tokens
  withdrawTokens(staker: string, amount: number, depositId: number) {
    if (this.paused) throw new Error('Withdraw is frozen');
    if (amount <= 0) throw new Error('Invalid amount');

    const deposit = this.depositInfos[staker][depositId];
    if (deposit.amount < amount) throw new Error('Amount to withdraw too high');
    if (now() < deposit.lockTo) throw new Error('Invalid time to withdraw');

    this._updatePool();

    deposit.rewardPending += deposit.amount * this.accTokenPerShare - deposit.rewardDebt;
    const pending = deposit.rewardPending;
    if (pending > 0) {
      deposit.rewardPending = 0;
      this._safeRewardTransfer(staker, pending);
    }

    const user = this.userInfos[staker];
    user.totalAmount -= amount;
    this.totalStakingTokens -= amount;

    deposit.amount -= amount;
    deposit.rewardDebt = deposit.amount * this.accTokenPerShare;

    this.stakedToken.transfer(POOL_ID, staker, amount);

    console.log(`Withdraw ${staker}, ${amount}, ${depositId}`);
  }

  // View function to see pending reward on frontend.
  pendingReward(user: string, depositId: number) {
    const deposit = this.depositInfos[user][depositId];
    let adjustedTokenPerShare = this.accTokenPerShare;
    if (now() > this.lastRewardTime && this.totalStakingTokens !== 0) {
      const multiplier = this._getMultiplier(this.lastRewardTime, now());
      const tokenReward = multiplier * this.rewardPerSecond;
      adjustedTokenPerShare += tokenReward / this.totalStakingTokens;
    }
    return deposit.rewardPending + (deposit.amount * adjustedTokenPerShare - deposit.rewardDebt);
  }

  // Pause or unpause the pool with status
  pause(status: boolean) {
    this.paused = status;
  }

  // It allows the admin to add reward tokens
  addRewardTokens(amount: number) {
    this.totalRewardTokens += amount;
    this.rewardToken.mint(POOL_ID, amount);
    console.log(`Add ${amount} tokens to the reward pool`);
  }

  // Update reward variables of the given pool to be up-to-date.
  private _updatePool() {
    if (this.totalStakingTokens === 0) {
      this.lastRewardTime = now();
      return;
    }
    if (now() <= this.lastRewardTime) {
      return;
    }
    const multiplier = this._getMultiplier(this.lastRewardTime, now());
    const tokenReward = multiplier * this.rewardPerSecond;
    this.accTokenPerShare += tokenReward / this.totalStakingTokens;
    this.lastRewardTime = now();
  }

  // Return reward multiplier over the given _from to _to time.
  private _getMultiplier(from: number, to: number) {
    if (to <= this.endTime) {
      return to - from;
    } else if (from >= this.endTime) {
      return 0;
    } else {
      return this.endTime - from;
    }
  }

  // Transfer reward tokens.
  private _safeRewardTransfer(to: string, amount: number) {
    const rewardTokenBal = this.totalRewardTokens;
    const safeAmount = Math.round(amount * 1e4) / 1e4; // 4 decimal places
    if (rewardTokenBal < safeAmount) throw new Error('Not enough reward tokens');

    this.totalRewardTokens -= safeAmount;
    this.rewardToken.transfer(POOL_ID, to, safeAmount);
    console.log(`Transfer ${safeAmount} rewards to ${to}`);
  }
}
