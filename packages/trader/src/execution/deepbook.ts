import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  deepbook,
  testnetCoins,
  type BalanceManager,
  type DeepBookClient as DeepBookExtension,
  type Pool,
  type PoolTradeParams,
  testnetPools
} from "@mysten/deepbook-v3";
import type { ClientWithExtensions } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { loadASideEnv, type ASideEnv, type Mandate, type TradeIntent } from "@narc/shared";
import { getSuiClient, keypairFromSuiPrivateKey, signAndExecuteWithRetry } from "../sui.js";
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
  if (persisted && (await balanceManagerExists(persisted.balanceManagerId, env))) {
    return persisted.balanceManagerId;
  }

  if (env.DEEPBOOK_BALANCE_MANAGER_ID && (await balanceManagerExists(env.DEEPBOOK_BALANCE_MANAGER_ID, env))) {
    await persistBalanceManager(env, runtime.address, env.DEEPBOOK_BALANCE_MANAGER_ID);
    return env.DEEPBOOK_BALANCE_MANAGER_ID;
  }

  const result = await signAndExecuteWithRetry(env, () => {
    const tx = new Transaction();
    runtime.client.deepbook.balanceManager.createAndShareBalanceManager()(tx);
    return tx;
  }, { showEffects: true, showObjectChanges: true, showEvents: true }) as any;

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
  return withTimeout(
    runtime.client.deepbook.accountOpenOrders(runtime.pool.runtimePoolKey, runtime.balanceManagerKey),
    10_000,
    "Timed out fetching DeepBook open orders."
  );
}

export async function depositIntoBalanceManager(
  balanceManagerId: string,
  coinKey: string,
  amount: number,
  env: ASideEnv = loadASideEnv()
): Promise<DeepBookOrderResult> {
  const runtime = await createRuntime(env, balanceManagerId);
  const result = await signAndExecuteWithRetry(env, () => {
    const tx = new Transaction();
    // SDK expects display units (e.g. SUI, not MIST); divide amount by coin scalar.
    const coinScalar = (testnetCoins as Record<string, { scalar: number }>)[coinKey]?.scalar ?? 1;
    runtime.client.deepbook.balanceManager.depositIntoManager(runtime.balanceManagerKey, coinKey, amount / coinScalar)(tx);
    return tx;
  }, { showEffects: true, showObjectChanges: true, showEvents: true }) as any;

  return {
    digest: requireSuccessDigest(result),
    raw: result
  };
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
  const baseQuantity = quantityFromIntent(intent);
  assertStaticOrderShape(intent, runtime.pool, baseQuantity, mandate);

  const result = await signAndExecuteWithRetry(env, () => {
    const tx = new Transaction();
    appendLimitOrder(tx, runtime, intent, baseQuantity);
    return tx;
  }, { showEffects: true, showObjectChanges: true, showEvents: true }) as any;

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
  const result = await signAndExecuteWithRetry(env, () => {
    const tx = new Transaction();
    runtime.client.deepbook.deepBook.cancelOrders(
      runtime.pool.runtimePoolKey,
      runtime.balanceManagerKey,
      orderIds
    )(tx);
    return tx;
  }, { showEffects: true, showObjectChanges: true, showEvents: true }) as any;

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

export async function getRuntimeWithManager(env: ASideEnv = loadASideEnv()): Promise<DeepBookRuntimeWithManager> {
  const balanceManagerId = await getOrCreateBalanceManager(env);
  return createRuntime(env, balanceManagerId);
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
    clientOrderId: String(Date.now()),
    price: intent.limitPrice,
    quantity,
    isBid: intent.side === "bid",
    payWithDeep: false
  })(tx);
}

export function appendDeepBookLimitOrder(
  tx: Transaction,
  runtime: DeepBookRuntimeWithManager,
  intent: TradeIntent
): void {
  appendLimitOrder(tx, runtime, intent, quantityFromIntent(intent));
}

function assertStaticOrderShape(
  intent: TradeIntent,
  pool: ResolvedDeepBookPool,
  quantity: number,
  mandate: Mandate
): void {
  if (intent.pair !== pool.pair) {
    throw new Error(`Intent pair ${intent.pair} does not match resolved DeepBook pool pair ${pool.pair}.`);
  }
  if (quantity <= 0) {
    throw new Error(`Order base quantity must be positive. Received ${quantity}.`);
  }
  if (!isStepMultiple(intent.sizeQuote, mandate.lotSizeQuote)) {
    throw new Error(
      `Order quote size ${intent.sizeQuote} does not align with mandate lotSizeQuote ${mandate.lotSizeQuote}.`
    );
  }
  if (!isStepMultiple(intent.limitPrice, mandate.tickSize)) {
    throw new Error(
      `Limit price ${intent.limitPrice} does not align with mandate tickSize ${mandate.tickSize}.`
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

  const client = getSuiClient(env).$extend(
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

async function balanceManagerExists(balanceManagerId: string, env: ASideEnv): Promise<boolean> {
  try {
    const object = await getSuiClient(env).getObject({
      id: balanceManagerId
    });
    return object.data?.objectId === balanceManagerId;
  } catch {
    return false;
  }
}

function requireSuccessDigest(result: {
  digest?: string;
  effects?: { status?: { status?: string; error?: unknown } };
  objectChanges?: Array<Record<string, unknown>>;
  errors?: unknown[];
}): string {
  const status = result.effects?.status?.status;
  if (status && status !== "success") {
    throw new Error(
      `DeepBook transaction aborted${result.digest ? ` (${result.digest})` : ""}: ${stringifyError(result.effects?.status?.error)}`
    );
  }
  if (result.errors && result.errors.length > 0) {
    throw new Error(`DeepBook transaction failed: ${stringifyError(result.errors)}`);
  }
  if (!result.digest) {
    throw new Error("DeepBook transaction returned without a digest.");
  }
  return result.digest;
}

function extractCreatedBalanceManagerId(result: {
  objectChanges?: Array<Record<string, unknown>>;
}): string | null {
  const objectChanges = result.objectChanges ?? [];
  const created = objectChanges.find(
    (item) =>
      item.type === "created" &&
      typeof item.objectType === "string" &&
      item.objectType.includes("::balance_manager::BalanceManager")
  );
  return typeof created?.objectId === "string" ? created.objectId : null;
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

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return await new Promise<T>((resolveTimeout, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolveTimeout(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
