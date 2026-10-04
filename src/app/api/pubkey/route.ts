import { signingKeys } from "@/lib/keys";
import { handle } from "@/lib/http";

export async function GET() {
  return handle(async () => {
    const { publicPem, spkiB64 } = await signingKeys();
    return Response.json({ algorithm: "Ed25519", spki: spkiB64, pem: publicPem });
  });
}
