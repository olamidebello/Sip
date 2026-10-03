import mysql from "mysql2/promise";
import fs from "node:fs";

export function createDatabase(url) {
  if (!url) throw new Error("MYSQL_URL is required");
  const parsed = new URL(url);
  if (parsed.protocol !== "mysql:" || !parsed.hostname || !parsed.pathname.slice(1))
    throw new Error("MYSQL_URL must include a MySQL host and database");
  const pool = mysql.createPool({
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.slice(1)),
    timezone: "Z",
    ssl: process.env.MYSQL_SSL_CA ? { ca: fs.readFileSync(process.env.MYSQL_SSL_CA) } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    multipleStatements: false
  });
  function wrap(connection) {
    return {
      async query(sql, params = []) {
        const ordered = [];
        const statement = sql.replace(/\$(\d+)/g, (_, index) => {
          ordered.push(params[Number(index) - 1]);
          return "?";
        });
        const [data] = ordered.length
          ? await connection.execute(statement, ordered)
          : await connection.query(statement);
        return { rows: Array.isArray(data) ? data : [],
          rowCount: Array.isArray(data) ? data.length : data.affectedRows };
      },
      release: () => connection.release?.()
    };
  }
  return {
    query: wrap(pool).query,
    async connect() { return wrap(await pool.getConnection()); },
    async initialize(sql) {
      for (const statement of sql.split(";").map((part) => part.trim()).filter(Boolean))
        await pool.query(statement);
    },
    end: () => pool.end()
  };
}
