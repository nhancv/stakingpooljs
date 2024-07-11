export class Token {
  balanceOf: { [uid: string]: number };

  constructor() {
    this.balanceOf = {};
  }

  transfer(from: string, to: string, amount: number) {
    if (amount <= 0) {
      throw new Error('Invalid amount');
    }

    if (!this.balanceOf[from]) this.balanceOf[from] = 0;
    if (!this.balanceOf[to]) this.balanceOf[to] = 0;

    if (this.balanceOf[from] < amount) {
      throw new Error('Insufficient balance');
    }
    this.balanceOf[from] -= amount;
    this.balanceOf[to] += amount;
  }

  mint(to: string, amount: number) {
    if (amount <= 0) {
      throw new Error('Invalid amount');
    }
    if (!this.balanceOf[to]) this.balanceOf[to] = 0;
    this.balanceOf[to] += amount;
  }
}
