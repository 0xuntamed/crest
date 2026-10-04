import "server-only";
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { pool } from "./db";

let cached: Promise<{ privateKey: KeyObject; publicPem: string; spkiB64: string }> | null = null;

async function load() {
  let privatePem = process.env.CREST_SIGNING_KEY?.replace(/\\n/g, "\n");
  if (!privatePem) {
    const { rows } = await pool.query<{ private_pem: string }>("select private_pem from server_keys where id = 1");
    if (rows[0]) {
      privatePem = rows[0].private_pem;
    } else {
      const { privateKey, publicKey } = generateKeyPairSync("ed25519");
      const priv = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
      const pub = publicKey.export({ type: "spki", format: "pem" }).toString();
      await pool.query(
        "insert into server_keys(id, private_pem, public_pem) values (1, $1, $2) on conflict (id) do nothing",
        [priv, pub],
      );
      const again = await pool.query<{ private_pem: string }>("select private_pem from server_keys where id = 1");
      privatePem = again.rows[0].private_pem;
    }
  }
  const privateKey = createPrivateKey(privatePem);
  const publicKey = createPublicKey(privateKey);
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const spkiB64 = (publicKey.export({ type: "spki", format: "der" }) as Buffer).toString("base64");
  return { privateKey, publicPem, spkiB64 };
}

export function signingKeys() {
  cached ??= load().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

export async function signPayload(payload: string): Promise<string> {
  const { privateKey } = await signingKeys();
  return sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64");
}
