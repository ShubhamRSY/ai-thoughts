import { createServer } from "node:http";

// A stand-in for OpenAI's moderation endpoint, so E2E can check that text is
// screened (SECURITY_AUDIT.md M2) without a real key or any outside request.
// The test server is pointed here with OPENAI_BASE_URL, which the app honors
// only outside production (lib/content-moderation.ts). Flags any input that
// contains FLAG_MARKER; anything else is clean. Other endpoints 404, which the
// app treats as "screening unavailable" and allows.

export const FAKE_MODERATION_PORT = Number(process.env.E2E_MODERATION_PORT ?? 3999);
export const FLAG_MARKER = "E2E-MODERATION-FLAG";

export function startFakeModeration(): Promise<() => Promise<void>> {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/v1/moderations") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ results: [{ flagged: body.includes(FLAG_MARKER) }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_MODERATION_PORT, "127.0.0.1", () =>
      resolve(() => new Promise<void>((done) => server.close(() => done())))
    );
  });
}
