import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Secp256k1Keypair } from "@mysten/sui/keypairs/secp256k1";
import { Secp256r1Keypair } from "@mysten/sui/keypairs/secp256r1";

export const dynamic = "force-dynamic";

function addressFromPrivateKey(privateKey: string): string {
  const decoded = decodeSuiPrivateKey(privateKey);
  if (decoded.scheme === "ED25519") return Ed25519Keypair.fromSecretKey(decoded.secretKey).toSuiAddress();
  if (decoded.scheme === "Secp256k1") return Secp256k1Keypair.fromSecretKey(decoded.secretKey).toSuiAddress();
  if (decoded.scheme === "Secp256r1") return Secp256r1Keypair.fromSecretKey(decoded.secretKey).toSuiAddress();
  throw new Error(`Unknown key scheme: ${decoded.scheme}`);
}

export async function GET() {
  const privateKey = process.env.TRADER_PRIVATE_KEY;
  if (!privateKey) {
    return Response.json({ error: "TRADER_PRIVATE_KEY not configured" }, { status: 503 });
  }
  try {
    const address = addressFromPrivateKey(privateKey);
    return Response.json({ address });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
