// Local stand-in for Google Docs, for exercising extension/content.js without a Google account.
// Usage: node tests/ext-harness/server.mjs   then open http://localhost:4100/document/d/<id>/edit
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT ?? 4100);
const root = join(import.meta.dirname, "..", "..");
const types = { ".js": "text/javascript", ".html": "text/html", ".png": "image/png", ".json": "application/json" };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  try {
    if (/^\/document\/d\/[A-Za-z0-9_-]{20,120}\/edit$/.test(url.pathname)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(await readFile(join(import.meta.dirname, "docs.html")));
    }
    if (url.pathname === "/shim.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(await readFile(join(import.meta.dirname, "shim.js")));
    }
    if (url.pathname.startsWith("/ext/")) {
      const file = normalize(join(root, "extension", url.pathname.slice(5)));
      if (!file.startsWith(join(root, "extension"))) throw new Error("bad path");
      res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
      return res.end(await readFile(file));
    }
    res.writeHead(404).end("not found");
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`docs harness on http://localhost:${PORT}/document/d/1HarnessDocABCDEFGHIJKLMNOPQRSTUV/edit`));
