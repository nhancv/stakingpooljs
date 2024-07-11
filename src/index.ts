import { StakingPool, now } from './pool';
import { Token } from './token';

// Delay
const sleep = (ms, printLog = true) => {
  if (ms === 0) return;
  printLog && console.log(`Sleeping ${ms / 1000} seconds`);
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const processScript = async () => {
  const userId = 'Ux123';
  const stakeAmount = 1000;

  const usd = new Token();
  usd.mint(userId, stakeAmount);

  const eth = new Token();

  const start = now();
  const end = start + 3;
  const pool = new StakingPool(usd, eth, 0.1, start, end, 3);
  pool.addRewardTokens(100);

  pool.depositTokens(userId, stakeAmount);
  console.log('userInfos:', pool.userInfos[userId]);
  console.log('depositInfos:', pool.depositInfos[userId][0], '\n');
  console.log('userStake:', usd.balanceOf[userId]);
  console.log('userReward:', eth.balanceOf[userId]);

  await sleep(3_000);

  pool.withdrawTokens(userId, stakeAmount, 0);
  console.log('userInfos:', pool.userInfos[userId]);
  console.log('depositInfos:', pool.depositInfos[userId][0]);
  console.log('userStake:', usd.balanceOf[userId]);
  console.log('userReward:', eth.balanceOf[userId]);
};

processScript()
  .then(() => {
    console.log('DONE');
    process.exit(0);
  })
  .catch((error) => console.error(error));
