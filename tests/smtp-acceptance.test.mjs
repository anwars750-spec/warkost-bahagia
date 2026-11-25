import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { localSmtpFixture } from "./helpers/local-smtp-fixture.mjs";

function probe(smtp, { trusted = true } = {}) {
  const child = fork(
    fileURLToPath(new URL("./helpers/smtp-send-probe.mjs", import.meta.url)),
    [],
    {
      windowsHide: true,
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: {
        ...process.env,
        AUTH_TIMINGS: "",
        NODE_ENV: "test",
        EMAIL_TRANSPORT: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT: String(smtp.port),
        SMTP_SECURE: "false",
        SMTP_USER: "fixture-user",
        SMTP_PASS: "fixture-password",
        SMTP_FROM: "fixture@example.test",
        NODE_EXTRA_CA_CERTS: trusted ? smtp.cert : "",
        NODE_TLS_REJECT_UNAUTHORIZED: "1",
      },
    },
  );
  let result;
  const pending = [];
  child.on("message", (message) => {
    if (message.type === "result") {
      result = message.stage;
      for (const resolve of pending.splice(0)) resolve(result);
    }
  });
  return {
    result: () =>
      result
        ? Promise.resolve(result)
        : new Promise((resolve) => pending.push(resolve)),
    status: () =>
      new Promise((resolve) => {
        const listener = (message) => {
          if (message.type === "status") {
            child.off("message", listener);
            resolve(message.stage);
          }
        };
        child.on("message", listener);
        child.send({ type: "status" });
      }),
    close() {
      child.kill();
    },
  };
}
test(
  "SMTP success depends on DATA acceptance, never on a delayed QUIT reply",
  { timeout: 15000 },
  async () => {
    const smtp = await localSmtpFixture({ holdData: true, holdQuit: true });
    const child = probe(smtp);
    try {
      await smtp.waitFor("data_received");
      assert.equal(await child.status(), "pending");
      smtp.releaseData();
      await smtp.waitFor("quit_received");
      assert.equal(await child.result(), "resolved");
      assert.equal(smtp.events.includes("quit_completed"), false);
    } finally {
      smtp.releaseQuit();
      child.close();
      await smtp.close();
    }
  },
);
test("SMTP refusal of DATA remains a failure", { timeout: 15000 }, async () => {
  const smtp = await localSmtpFixture({ dataCode: 550 });
  const child = probe(smtp);
  try {
    assert.equal(await child.result(), "rejected");
    assert.equal(smtp.events.includes("quit_received"), false);
  } finally {
    child.close();
    await smtp.close();
  }
});
test(
  "connection loss before DATA acceptance fails closed",
  { timeout: 15000 },
  async () => {
    const smtp = await localSmtpFixture({ dataDisconnect: true });
    const child = probe(smtp);
    try {
      assert.equal(await child.result(), "rejected");
      assert.equal(smtp.events.includes("data_accepted"), false);
    } finally {
      child.close();
      await smtp.close();
    }
  },
);
test(
  "a disconnect during QUIT cannot invalidate an already accepted message",
  { timeout: 15000 },
  async () => {
    const smtp = await localSmtpFixture({ quitDisconnect: true });
    const child = probe(smtp);
    try {
      assert.equal(await child.result(), "resolved");
      await smtp.waitFor("quit_received");
      assert.equal(smtp.events.includes("data_accepted"), true);
    } finally {
      child.close();
      await smtp.close();
    }
  },
);
test(
  "SMTP TLS certificates are still validated",
  { timeout: 15000 },
  async () => {
    const smtp = await localSmtpFixture();
    const child = probe(smtp, { trusted: false });
    try {
      assert.equal(await child.result(), "rejected");
      assert.equal(smtp.events.includes("data_received"), false);
    } finally {
      child.close();
      await smtp.close();
    }
  },
);

test(
  "accepted SMTP cleanup closes even when QUIT never gets a reply",
  { timeout: 15000 },
  async () => {
    const smtp = await localSmtpFixture({ holdQuit: true });
    const child = probe(smtp);
    try {
      await smtp.waitFor("quit_received");
      assert.equal(await child.result(), "resolved");
      await smtp.waitFor("connection_closed");
      assert.equal(smtp.events.includes("quit_completed"), false);
    } finally {
      child.close();
      await smtp.close();
    }
  },
);
