import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createStorefrontRevalidationSecretResolver, matchesStorefrontRevalidationSecret } from "../src/storefront-revalidation.ts";

test("explicit configuration remains authoritative without reading private config", async () => {
  const resolve = createStorefrontRevalidationSecretResolver({ configuredSecret: () => " configured ", loadInternalSecret: async () => { throw new Error("Must not read"); } });
  assert.equal(await resolve(), "configured");
});

test("services without deployment env share a scoped credential, never the internal admin secret", async () => {
  const internal = "fixture-private-internal-secret";
  let reads = 0;
  const options = { configuredSecret: () => undefined, loadInternalSecret: async () => { reads++; return internal; } };
  const admin = createStorefrontRevalidationSecretResolver(options);
  const storefront = createStorefrontRevalidationSecretResolver(options);
  const [left, same, right] = await Promise.all([admin(), admin(), storefront()]);
  assert.equal(left, right);
  assert.equal(left, same);
  assert.notEqual(left, internal);
  assert.equal(left, createHmac("sha256", internal).update("rosta-storefront-revalidation:v1").digest("hex"));
  assert.equal(reads, 2, "one private config lookup per service, including concurrent requests");
  await admin(); assert.equal(reads, 2, "successful lookups are cached");
  assert.equal(matchesStorefrontRevalidationSecret(left, right), true);
  assert.equal(matchesStorefrontRevalidationSecret(left, internal), false);
});

test("unavailable private config fails closed and can recover", async () => {
  let available = false;
  const resolve = createStorefrontRevalidationSecretResolver({ configuredSecret: () => undefined, loadInternalSecret: async () => { if (!available) throw new Error("Unavailable"); return "fixture-recovered-secret"; } });
  assert.equal(await resolve(), "");
  assert.equal(matchesStorefrontRevalidationSecret("", ""), false);
  available = true;
  assert.ok(await resolve());
  assert.equal(matchesStorefrontRevalidationSecret("ascii", "ééééé"), false);
  assert.equal(matchesStorefrontRevalidationSecret("abc", "abd"), false);
});
