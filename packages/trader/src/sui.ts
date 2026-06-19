import { getJsonRpcFullnodeUrl, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";
import type { ASideEnv } from "@narc/shared";

export function getSuiClient(env: Pick<ASideEnv, "SUI_NETWORK" | "SUI_RPC_URL">): SuiJsonRpcClient {
  return new SuiJsonRpcClient({
    network: env.SUI_NETWORK,
    url: env.SUI_RPC_URL || getJsonRpcFullnodeUrl(env.SUI_NETWORK)
  });
}

export function getSuiGrpcClient(env: Pick<ASideEnv, "SUI_NETWORK" | "SUI_RPC_URL">): SuiGrpcClient {
  return new SuiGrpcClient({
    network: env.SUI_NETWORK,
    baseUrl: env.SUI_RPC_URL || "https://fullnode.testnet.sui.io:443"
  });
}

export function keypairFromSuiPrivateKey(privateKey: string): Ed25519Keypair | Secp256k1Keypair | Secp256r1Keypair {
  const decoded = decodeSuiPrivateKey(privateKey);
  if (decoded.scheme === "ED25519") return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  if (decoded.scheme === "Secp256k1") return Secp256k1Keypair.fromSecretKey(decoded.secretKey);
  if (decoded.scheme === "Secp256r1") return Secp256r1Keypair.fromSecretKey(decoded.secretKey);
  throw new Error(`Unsupported private key scheme: ${decoded.scheme}`);
}
