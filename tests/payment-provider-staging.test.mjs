import test from "node:test";
import assert from "node:assert/strict";

const previous = {
  NODE_ENV: process.env.NODE_ENV,
  DEPLOYMENT_ENV: process.env.DEPLOYMENT_ENV,
  PAYMENT_PROVIDER_MODE: process.env.PAYMENT_PROVIDER_MODE,
};

const { paymentProviderConfiguration, LOCAL_QRIS_PROVIDER } =
  await import("../lib/payment-provider.mjs");

function setEnv({ nodeEnv, deploymentEnv, mode }) {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;
  if (deploymentEnv === undefined) delete process.env.DEPLOYMENT_ENV;
  else process.env.DEPLOYMENT_ENV = deploymentEnv;
  if (mode === undefined) delete process.env.PAYMENT_PROVIDER_MODE;
  else process.env.PAYMENT_PROVIDER_MODE = mode;
}

test.after(() => {
  setEnv({
    nodeEnv: previous.NODE_ENV,
    deploymentEnv: previous.DEPLOYMENT_ENV,
    mode: previous.PAYMENT_PROVIDER_MODE,
  });
});

test("staging production build defaults QRIS simulation untuk UAT", () => {
  setEnv({ nodeEnv: "production", deploymentEnv: "staging", mode: undefined });
  const configuration = paymentProviderConfiguration();
  assert.equal(configuration.available, true);
  assert.equal(configuration.simulation, true);
  assert.equal(configuration.provider, LOCAL_QRIS_PROVIDER);
});

test("production tanpa provider QRIS tetap unavailable", () => {
  setEnv({ nodeEnv: "production", deploymentEnv: "production", mode: undefined });
  const configuration = paymentProviderConfiguration();
  assert.equal(configuration.available, false);
  assert.equal(configuration.simulation, false);
});

test("production menolak explicit simulation", () => {
  setEnv({ nodeEnv: "production", deploymentEnv: "production", mode: "simulation" });
  const configuration = paymentProviderConfiguration();
  assert.equal(configuration.available, false);
  assert.equal(configuration.provider, LOCAL_QRIS_PROVIDER);
});
