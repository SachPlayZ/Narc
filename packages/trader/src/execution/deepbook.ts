import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  deepbook,
  type BalanceManager,
  type DeepBookClient as DeepBookExtension,
  type Pool,
  type PoolBookParams,
  type PoolTradeParams,
  testnetPools
} from "@mysten/deepbook-v3";
import type { ClientWithExtensions } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { loadASideEnv, type ASideEnv, type Mandate, type TradeIntent } from "@narc/shared";
import { getSuiGrpcClient, keypairFromSuiPrivateKey } from "../sui.js";
import { assertPoolChecksPass, checkPoolParameters } from "./poolChecks.js";

const ACTIVE_POOL_KEY = "NARC_ACTIVE_POOL";
const ACTIVE_BALANCE_MANAGER_KEY = "NARC_ACTIVE_BALANCE_MANAGER";
const BALANCE_MANAGER_ARTIFACT = "deepbook-balance-manager.json";
const EPSILON = 1e-9;
const FALLBACK_FEE_BPS = 2.5;

export type DeepBookOrderResult = {
  digest: string;
  raw: unknown;
};

export type ResolvedDeepBookPool = {
  requested: string;
  lookupKey: string;
  runtimePoolKey: string;
  address: string;
  baseCoin: string;
  quoteCoin: string;
  pair: string;
};

type DeepBookClientWithExtension = ClientWithExtensions<{ deepbook: DeepBookExtension }>;

export type DeepBookRuntime = {
  env: ASideEnv;
  address: string;
  client: DeepBookClientWithExtension;
  pool: ResolvedDeepBookPool;
};

type DeepBookRuntimeWithManager = DeepBookRuntime & {
  balanceManagerId: string;
  balanceManagerKey: string;
};

type PersistedBalanceManager = {
  ownerAddress: string;
  balanceManagerId: string;
  network: ASideEnv["SUI_NETWORK"];
  updatedAt: string;
};

export async function getDeepBookClient(env: ASideEnv = loadASideEnv()): Promise<DeepBookRuntime> {
  return createRuntime(env);
}

export async function getOrCreateBalanceManager(env: ASideEnv = loadASideEnv()): Promise<string> {
  const runtime = await createRuntime(env);
  const persisted = await readPersistedBalanceManager(env, runtime.address);
  if (persisted) return persisted.balanceManagerId;
  if (env.DEEPBOOK_BALANCE_MANAGER_ID) return env.DEEPBOOK_BALANCE_MANAGER_ID;

  const existing = await runtime.client.deepbook.getBalanceManagerIds(runtime.address);
  if (existing.length > 0) {
    await persistBalanceManager(env, runtime.address, existing[0]);
    return existing[0];
  }

  const tx = new Transaction();
  runtime.client.deepbook.balanceManager.createAndShareBalanceManager()(tx);

  const result = await runtime.client.core.signAndExecuteTransaction({
    signer: keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY),
    transaction: tx,
    include: { effects: true, objectTypes: true, events: true }
  });

  const digest = requireSuccessDigest(result);
  const createdId = extractCreatedBalanceManagerId(result);
  if (!createdId) {
    throw new Error(`Created BalanceManager tx ${digest}, but could not locate the new object id in effects.`);
  }

  await persistBalanceManager(env, runtime.address, createdId);
  return createdId;
}

export async function getOpenOrders(
  balanceManagerId: string,
  env: ASideEnv = loadASideEnv()
): Promise<string[]> {
  const runtime = await createRuntime(env, balanceManagerId);
  return runtime.client.deepbook.accountOpenOrders(runtime.pool.runtimePoolKey, runtime.balanceManagerKey);
}

export async function placeOrder(
  intent: TradeIntent,
  mandate: Mandate,
  env: ASideEnv = loadASideEnv()
): Promise<DeepBookOrderResult> {
  const balanceManagerId = await getOrCreateBalanceManager(env);
  const runtime = await createRuntime(env, balanceManagerId);

  const checks = checkPoolParameters(intent, mandate, runtime.pool.address);
  assertPoolChecksPass(checks);

  const bookParams = await runtime.client.deepbook.poolBookParams(runtime.pool.runtimePoolKey);
  const baseQuantity = quantityFromIntent(intent);
  assertRuntimeOrderShape(intent, runtime.pool, bookParams, baseQuantity);

  const tx = new Transaction();
  appendLimitOrder(tx, runtime, intent, baseQuantity);

  const result = await runtime.client.core.signAndExecuteTransaction({
    signer: keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY),
    transaction: tx,
    include: { effects: true, events: true }
  });

  return {
    digest: requireSuccessDigest(result),
    raw: result
  };
}

export async function cancelLiveOrdersForManager(
  balanceManagerId: string,
  orderIds: string[],
  env: ASideEnv = loadASideEnv()
): Promise<DeepBookOrderResult> {
  const runtime = await createRuntime(env, balanceManagerId);
  const tx = new Transaction();
  runtime.client.deepbook.deepBook.cancelLiveOrders(
    runtime.pool.runtimePoolKey,
    runtime.balanceManagerKey,
    orderIds
  )(tx);

  const result = await runtime.client.core.signAndExecuteTransaction({
    signer: keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY),
    transaction: tx,
    include: { effects: true, events: true }
  });

  return {
    digest: requireSuccessDigest(result),
    raw: result
  };
}

export async function readTradeParams(env: ASideEnv = loadASideEnv()): Promise<PoolTradeParams> {
  const runtime = await createRuntime(env);
  return runtime.client.deepbook.poolTradeParams(runtime.pool.runtimePoolKey);
}

export function feeEstimateFromTradeParams(
  intent: TradeIntent,
  tradeParams: Pick<PoolTradeParams, "takerFee">
) {
  return {
    estimatedFeeBps: Number((tradeParams.takerFee * 10_000).toFixed(6)),
    feeAmountQuote: Number((intent.sizeQuote * tradeParams.takerFee).toFixed(9)),
    feeToken: quoteTokenForPair(intent.pair),
    source: "deepbook" as const
  };
}

export function unavailableFeeEstimate(intent: TradeIntent) {
  return {
    estimatedFeeBps: FALLBACK_FEE_BPS,
    feeAmountQuote: Number(((intent.sizeQuote * FALLBACK_FEE_BPS) / 10_000).toFixed(9)),
    feeToken: quoteTokenForPair(intent.pair),
    source: "static_fallback" as const
  };
}

export function resolveDeepBookPool(poolHint: string): ResolvedDeepBookPool {
  const byKey = testnetPools[poolHint];
  if (byKey) {
    return {
      requested: poolHint,
      lookupKey: poolHint,
      runtimePoolKey: ACTIVE_POOL_KEY,
      address: byKey.address,
      baseCoin: byKey.baseCoin,
      quoteCoin: byKey.quoteCoin,
      pair: `${byKey.baseCoin}_${byKey.quoteCoin}`
    };
  }

  const lowered = poolHint.toLowerCase();
  const matched = Object.entries(testnetPools).find(([, pool]) => pool.address.toLowerCase() === lowered);
  if (!matched) {
    throw new Error(`Unknown DeepBook testnet pool '${poolHint}'. Use a known pool key like SUI_DBUSDC or the pool object id.`);
  }

  const [lookupKey, pool] = matched;
  return {
    requested: poolHint,
    lookupKey,
    runtimePoolKey: ACTIVE_POOL_KEY,
    address: pool.address,
    baseCoin: pool.baseCoin,
    quoteCoin: pool.quoteCoin,
    pair: `${pool.baseCoin}_${pool.quoteCoin}`
  };
}

export function quantityFromIntent(intent: TradeIntent): number {
  return Number((intent.sizeQuote / intent.limitPrice).toFixed(9));
}

export function isStepMultiple(value: number, step: number): boolean {
  const quotient = value / step;
  return Math.abs(quotient - Math.round(quotient)) < EPSILON;
}

function appendLimitOrder(
  tx: Transaction,
  runtime: DeepBookRuntimeWithManager,
  intent: TradeIntent,
  quantity: number
): void {
  runtime.client.deepbook.deepBook.placeLimitOrder({
    poolKey: runtime.pool.runtimePoolKey,
    balanceManagerKey: runtime.balanceManagerKey,
    clientOrderId: randomUUID(),
    price: intent.limitPrice,
    quantity,
    isBid: intent.side === "bid"
  })(tx);
}

function assertRuntimeOrderShape(
  intent: TradeIntent,
  pool: ResolvedDeepBookPool,
  bookParams: PoolBookParams,
  quantity: number
): void {
  if (intent.pair !== pool.pair) {
    throw new Error(`Intent pair ${intent.pair} does not match resolved DeepBook pool pair ${pool.pair}.`);
  }
  if (quantity < bookParams.minSize) {
    throw new Error(
      `Order base quantity ${quantity} is below DeepBook pool minSize ${bookParams.minSize} for ${pool.lookupKey}.`
    );
  }
  if (!isStepMultiple(quantity, bookParams.lotSize)) {
    throw new Error(
      `Order base quantity ${quantity} does not align with DeepBook lotSize ${bookParams.lotSize} for ${pool.lookupKey}.`
    );
  }
  if (!isStepMultiple(intent.limitPrice, bookParams.tickSize)) {
    throw new Error(
      `Limit price ${intent.limitPrice} does not align with DeepBook tickSize ${bookParams.tickSize} for ${pool.lookupKey}.`
    );
  }
}

async function createRuntime(env: ASideEnv, balanceManagerId?: string): Promise<DeepBookRuntimeWithManager>;
async function createRuntime(env: ASideEnv): Promise<DeepBookRuntime>;
async function createRuntime(env: ASideEnv, balanceManagerId?: string): Promise<DeepBookRuntime | DeepBookRuntimeWithManager> {
  const address = keypairFromSuiPrivateKey(env.TRADER_PRIVATE_KEY).toSuiAddress();
  const pool = resolveDeepBookPool(env.DEEPBOOK_POOL);
  const pools = {
    ...testnetPools,
    [ACTIVE_POOL_KEY]: {
      address: pool.address,
      baseCoin: pool.baseCoin,
      quoteCoin: pool.quoteCoin
    } satisfies Pool
  };

  const balanceManagers = balanceManagerId
    ? ({
        [ACTIVE_BALANCE_MANAGER_KEY]: { address: balanceManagerId } satisfies BalanceManager
      } satisfies Record<string, BalanceManager>)
    : undefined;

  const client = getSuiGrpcClient(env).$extend(
    deepbook({
      address,
      pools,
      balanceManagers
    })
  );

  if (!balanceManagerId) {
    return { env, address, client, pool };
  }

  return {
    env,
    address,
    client,
    pool,
    balanceManagerId,
    balanceManagerKey: ACTIVE_BALANCE_MANAGER_KEY
  };
}

async function readPersistedBalanceManager(
  env: ASideEnv,
  ownerAddress: string
): Promise<PersistedBalanceManager | null> {
  try {
    const payload = JSON.parse(await readFile(balanceManagerArtifactPath(env), "utf8")) as PersistedBalanceManager;
    if (payload.ownerAddress !== ownerAddress || payload.network !== env.SUI_NETWORK) return null;
    return payload;
  } catch {
    return null;
  }
}

async function persistBalanceManager(env: ASideEnv, ownerAddress: string, balanceManagerId: string): Promise<void> {
  const artifactPath = balanceManagerArtifactPath(env);
  await mkdir(dirname(artifactPath), { recursive: true });
  const payload: PersistedBalanceManager = {
    ownerAddress,
    balanceManagerId,
    network: env.SUI_NETWORK,
    updatedAt: new Date().toISOString()
  };
  await writeFile(artifactPath, JSON.stringify(payload, null, 2));
}

function balanceManagerArtifactPath(env: ASideEnv): string {
  const stateDir = resolve(process.cwd(), dirname(env.LOCAL_ACTIVITY_DIR));
  return resolve(stateDir, BALANCE_MANAGER_ARTIFACT);
}

function requireSuccessDigest(result: {
  $kind: "Transaction" | "FailedTransaction";
  Transaction?: { digest: string; status: { success: boolean; error: unknown } };
  FailedTransaction?: { digest: string; status: { success: boolean; error: unknown } };
}): string {
  if (result.$kind === "FailedTransaction") {
    const failure = result.FailedTransaction;
    throw new Error(`DeepBook transaction failed${failure?.digest ? ` (${failure.digest})` : ""}: ${stringifyError(failure?.status.error)}`);
  }

  const success = result.Transaction;
  if (!success) {
    throw new Error("DeepBook transaction returned without a success payload.");
  }

  if (!success.status.success) {
    throw new Error(`DeepBook transaction aborted (${success.digest}): ${stringifyError(success.status.error)}`);
  }

  return success.digest;
}

function extractCreatedBalanceManagerId(result: {
  $kind: "Transaction" | "FailedTransaction";
  Transaction?: {
    effects?: {
      changedObjects?: Array<{ objectId: string; idOperation?: string }>;
    };
    objectTypes?: Record<string, string>;
  };
}): string | null {
  const changedObjects = result.Transaction?.effects?.changedObjects ?? [];
  const objectTypes = result.Transaction?.objectTypes ?? {};
  const created = changedObjects.find(
    (item) =>
      item.idOperation === "Created" &&
      typeof objectTypes[item.objectId] === "string" &&
      objectTypes[item.objectId].includes("::balance_manager::BalanceManager")
  );
  return created?.objectId ?? null;
}

function quoteTokenForPair(pair: string): string | null {
  const [, quote] = pair.split("_");
  return quote || null;
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
