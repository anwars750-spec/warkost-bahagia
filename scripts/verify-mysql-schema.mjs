import mysql from "mysql2/promise";
import {
  loadMysqlMigrations,
  parseMysqlUrl,
  verifyMysqlSchema,
} from "../lib/mysql-operations.mjs";

const config = parseMysqlUrl(process.env.DATABASE_URL);
const connection = await mysql.createConnection(process.env.DATABASE_URL);
try {
  const result = await verifyMysqlSchema(
    connection,
    config.database,
    loadMysqlMigrations(),
  );
  console.log("Skema MySQL terverifikasi:", JSON.stringify(result));
} finally {
  await connection.end();
}
