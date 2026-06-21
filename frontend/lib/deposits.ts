export type DepositRecord = {
  wallet: string;
  amount: number;
  digest: string;
  ts: number;
};

const key = (wallet: string) => `narc-deposits-${wallet}`;

export function getDeposits(wallet: string): DepositRecord[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(key(wallet)) ?? "[]") as DepositRecord[];
  } catch {
    return [];
  }
}

export function addDeposit(record: DepositRecord): void {
  if (typeof window === "undefined") return;
  const existing = getDeposits(record.wallet);
  localStorage.setItem(key(record.wallet), JSON.stringify([...existing, record]));
}

export function totalDeposited(wallet: string): number {
  return getDeposits(wallet).reduce((s, d) => s + d.amount, 0);
}
