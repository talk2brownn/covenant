import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENV_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".env");

// Rewrites (or appends) KEY=value lines in circle-wallet/.env so scripts can hand their output
// to the next script without asking anyone to copy-paste — the copy-paste step is where a first
// run went sideways for a human. Values only ever land in the gitignored .env file.
export function updateEnv(updates: Record<string, string>) {
  let contents = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf8") : "";
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    contents = pattern.test(contents) ? contents.replace(pattern, () => line) : `${contents.replace(/\s*$/, "\n")}${line}\n`;
    process.env[key] = value;
  }
  fs.writeFileSync(ENV_PATH, contents);
}
