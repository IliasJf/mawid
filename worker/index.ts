import { handle, type Env, type Store } from "../server/app.ts";
import { initialShop } from "../server/shop.config.ts";
import type { Shop } from "../src/lib/types.ts";

// The few D1 and asset types this Worker uses.
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface D1Database {
  prepare(sql: string): D1Statement;
}
interface WorkerEnv extends Env {
  DB: D1Database;
  ASSETS: { fetch(req: Request): Promise<Response> };
}

function d1Store(db: D1Database): Store {
  return {
    async read() {
      const row = await db.prepare("SELECT version, data FROM shop WHERE id = 1").first<{ version: number; data: string }>();
      return row && { version: row.version, shop: JSON.parse(row.data) as Shop };
    },
    async write(version, shop) {
      const data = JSON.stringify(shop);
      const result =
        version === null
          ? await db.prepare("INSERT OR IGNORE INTO shop (id, version, data) VALUES (1, 1, ?)").bind(data).run()
          : await db
              .prepare("UPDATE shop SET data = ?, version = version + 1, updated_at = datetime('now') WHERE id = 1 AND version = ?")
              .bind(data, version)
              .run();
      return result.meta.changes === 1;
    },
    async hit(key, seconds) {
      const now = Date.now();
      await db.prepare("INSERT INTO hits (key, at) VALUES (?, ?)").bind(key, now).run();
      // Old rows go now and then, so the table stays small without a cron job.
      if (Math.random() < 0.02) await db.prepare("DELETE FROM hits WHERE at < ?").bind(now - 86_400_000).run();
      const row = await db.prepare("SELECT COUNT(*) AS n FROM hits WHERE key = ? AND at > ?").bind(key, now - seconds * 1000).first<{ n: number }>();
      return row?.n ?? 0;
    },
  };
}

export default {
  async fetch(req: Request, env: WorkerEnv): Promise<Response> {
    if (new URL(req.url).pathname.startsWith("/api/")) return handle(req, { store: d1Store(env.DB), env, initial: initialShop });
    return env.ASSETS.fetch(req);
  },
};
