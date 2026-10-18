import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
const target = path.resolve(".next/standalone");
await mkdir(path.join(target, ".next"), { recursive: true });
await cp("public", path.join(target, "public"), { recursive: true });
await cp(".next/static", path.join(target, ".next/static"), {
  recursive: true,
});
console.info("Standalone assets prepared. Start with npm start.");
