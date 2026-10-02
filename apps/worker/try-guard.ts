import { assertSafeTarget } from "./src/guard";

const urls = [
  "http://127.1", "http://2130706433", "http://0x7f.1", "http://0177.0.0.1",
  "http://[::1]", "http://[::ffff:127.0.0.1]", "http://0.0.0.0",
  "http://localhost.", "http://169.254.169.254/latest/meta-data",
  "http://user:pw@example.com", "http://example.com:8080",
  "ftp://example.com", "file:///etc/passwd",
  "http://example.com",
];

async function main() {
  for (const u of urls) {
    try { await assertSafeTarget(u); console.log("ALLOWED", u); }
    catch (e: any) { console.log("BLOCKED", u, "-", e.message); }
  }
}
main();