// Prints a fresh Ed25519 private key formatted for the CREST_SIGNING_KEY env var.
import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ed25519");
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
console.log(`CREST_SIGNING_KEY="${pem.trim().replace(/\n/g, "\\n")}"`);
