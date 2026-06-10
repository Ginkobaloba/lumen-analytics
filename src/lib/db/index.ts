import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/*
  SQLite access for the demo. The database file is a deterministic build
  artifact produced by `npm run seed`; it is gitignored and regenerated on
  deploy. DB_PATH can be overridden for tests.
*/

export const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "lumen.db");

let db: Database.Database | null = null;

export function openDb(dbPath: string = process.env.LUMEN_DB_PATH ?? DEFAULT_DB_PATH): Database.Database {
  if (db) return db;
  if (!fs.existsSync(dbPath)) {
    throw new Error(
      `Lumen database not found at ${dbPath}. Run \`npm run seed\` first.`,
    );
  }
  db = new Database(dbPath, { readonly: false, fileMustExist: true });
  db.pragma("journal_mode = WAL");
  return db;
}

/** Create (or recreate) a database file with the schema applied. */
export function createDb(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = `${dbPath}${suffix}`;
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  const fresh = new Database(dbPath);
  fresh.pragma("journal_mode = WAL");
  const schema = fs.readFileSync(
    path.join(process.cwd(), "src", "lib", "db", "schema.sql"),
    "utf8",
  );
  fresh.exec(schema);
  return fresh;
}
