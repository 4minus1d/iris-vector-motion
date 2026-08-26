// Zero-dependency static server for the films. Local development only:
// it has no authentication and sets no security headers.
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 5173;
const DEV_FRAMES = process.env.DEV_FRAMES === "1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

createServer(async (req, res) => {
  try {
    const { pathname, searchParams } = new URL(req.url, "http://localhost");

    /* Opt-in review hook, off unless DEV_FRAMES=1. Lets a page hand rendered
       frames back to disk so contact sheets can be checked without relying on
       the browser compositing. It writes only inside _frames/ and only with a
       sanitised name; keep it disabled by default. */
    if (DEV_FRAMES && req.method === "POST" && pathname === "/_frame") {
      const parts = [];
      for await (const c of req) parts.push(c);
      const name = (searchParams.get("name") || "frame").replace(/[^a-z0-9_.-]/gi, "").slice(0, 64);
      await mkdir(join(ROOT, "_frames"), { recursive: true });
      await writeFile(join(ROOT, "_frames", name + ".png"), Buffer.concat(parts));
      res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
      return;
    }

    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel.endsWith("/")) rel += "index.html";

    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    }).end(body);
  } catch (err) {
    const code = err.code === "ENOENT" ? 404 : 500;
    res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" }).end(String(code));
  }
}).listen(PORT, () => {
  console.log("morph test running at http://localhost:" + PORT);
});
