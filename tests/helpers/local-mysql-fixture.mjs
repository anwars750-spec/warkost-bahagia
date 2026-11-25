// Opt-in local MySQL fixture. Requires an explicit mysqld binary; never starts
// against an existing datadir or inherits service configuration/credentials.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawn, spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
export async function localMysqlFixture(binary) {
  if (!binary || !path.isAbsolute(binary) || !fs.existsSync(binary))
    throw Error("Pass an absolute local mysqld binary with --mysqld <path>");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "auth-path-mysql-"));
  let child, admin;
  const remove = () => {
    const resolved = path.resolve(temporary);
    if (
      path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
      !path.basename(resolved).startsWith("auth-path-mysql-")
    )
      throw Error("Unsafe fixture cleanup target");
    fs.rmSync(resolved, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  };
  try {
    const data = path.join(temporary, "data");
    fs.mkdirSync(data);
    const initialized = spawnSync(
      binary,
      [
        "--no-defaults",
        "--initialize-insecure",
        `--datadir=${data}`,
        `--log-error=${path.join(temporary, "initialize.log")}`,
      ],
      { windowsHide: true, stdio: "ignore", timeout: 60000 },
    );
    if (initialized.status !== 0)
      throw Error("Local MySQL fixture initialization failed");
    const reserve = net.createServer();
    await new Promise((resolve) => reserve.listen(0, "127.0.0.1", resolve));
    const port = reserve.address().port;
    await new Promise((resolve) => reserve.close(resolve));
    // All durability defaults retained, no general query/SQL-argument log.
    child = spawn(
      binary,
      [
        "--no-defaults",
        `--datadir=${data}`,
        `--port=${port}`,
        "--bind-address=127.0.0.1",
        "--mysqlx=OFF",
        "--general-log=0",
        `--log-error=${path.join(temporary, "server.log")}`,
      ],
      { windowsHide: true, stdio: "ignore" },
    );
    const stopped = new Promise((resolve) => {
      child.once("error", resolve);
      child.once("exit", resolve);
    });
    for (let i = 0; i < 150; i++) {
      if (child.exitCode !== null)
        throw Error("Local MySQL fixture stopped during startup");
      try {
        admin = await mysql.createConnection({
          host: "127.0.0.1",
          port,
          user: "root",
          password: "",
          connectTimeout: 1000,
        });
        break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!admin) throw Error("Local MySQL fixture startup timeout");
    await admin.execute("CREATE DATABASE auth_path_fixture");
    async function stop() {
      try {
        await admin.query("SHUTDOWN");
      } catch {}
      await admin.end().catch(() => {});
      await Promise.race([
        stopped,
        new Promise((resolve) => {
          const timer = setTimeout(() => {
            child.kill();
            resolve();
          }, 5000);
          timer.unref();
        }),
      ]);
      if (child.exitCode === null) {
        child.kill();
        await stopped;
      }
      remove();
    }
    return { port, dbName: "auth_path_fixture", username: "root", stop };
  } catch (error) {
    if (admin) await admin.end().catch(() => {});
    if (child && child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
    }
    remove();
    throw error;
  }
}
