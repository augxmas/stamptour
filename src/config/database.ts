import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  database: process.env.DB_NAME ?? "tracker",
  user: process.env.DB_USER ?? "tracker",
  password: process.env.DB_PASSWORD ?? "",
  charset: "utf8mb4",
  timezone: "+09:00",
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT ?? 8),
  queueLimit: Number(process.env.DB_QUEUE_LIMIT ?? 100),
  // DB is on a different subnet, so traffic crosses a stateful firewall.
  // Keepalive keeps the NAT/firewall flow alive and surfaces dead sockets
  // early; idle recycling drops pooled connections before the firewall
  // silently reaps them, which otherwise shows up as connect ETIMEDOUT.
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: Number(process.env.DB_IDLE_TIMEOUT_MS ?? 30000),
  maxIdle: Number(process.env.DB_MAX_IDLE ?? 4),
});

export default pool;
