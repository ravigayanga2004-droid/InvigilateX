import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import path from "node:path";
const databaseDir = path.resolve(".local/postgres");
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "examguard",
  password: "examguard_local",
  port: 54329,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
async function main() {
  if (!existsSync(path.join(databaseDir, "PG_VERSION"))) await pg.initialise();
  await pg.start();
  const client = pg.getPgClient();
  await client.connect();
  const result = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'examguard'",
  );
  if (!result.rowCount) await pg.createDatabase("examguard");
  const test = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'examguard_test'",
  );
  if (!test.rowCount) await pg.createDatabase("examguard_test");
  await client.end();
  console.info(
    "Local PostgreSQL ready on 127.0.0.1:54329. Ctrl+C stops it. Data persists in .local/postgres.",
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, async () => {
      await pg.stop();
      process.exit(0);
    });
  setInterval(() => {}, 60000);
}
main().catch(() => {
  console.error(
    "Unable to start local PostgreSQL. Check whether port 54329 is in use and inspect .local/postgres.",
  );
  process.exit(1);
});
