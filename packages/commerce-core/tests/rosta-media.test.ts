import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchRostaMediaHeaders, normalizeRostaSupabaseUrl, rostaMediaCacheControl,
  rostaPublicMediaReferences, rostaPublicMediaUrl,
  ROSTA_RETIRED_CLOUD_URL, ROSTA_SELF_HOSTED_SUPABASE_URL, ROSTA_STORE_URL,
} from "../src/rosta-media.ts";

test("missing and retired configuration both resolve to the self-host database", () => {
  for (const url of [undefined, "", ROSTA_RETIRED_CLOUD_URL, ROSTA_SELF_HOSTED_SUPABASE_URL + "/rest/v1/"]) {
    assert.equal(normalizeRostaSupabaseUrl(url), ROSTA_SELF_HOSTED_SUPABASE_URL);
  }
});
test("database configuration rejects storefront, foreign tenant and credential-bearing origins", () => {
  for (const url of [ROSTA_STORE_URL, "https://supabase.ruthistanbul.com", "https://rosta-supabase.tail178b60.ts.net.evil.test", ROSTA_SELF_HOSTED_SUPABASE_URL + "?token=1", ROSTA_SELF_HOSTED_SUPABASE_URL.replace("https://", "https://user:password@")]) {
    assert.throws(() => normalizeRostaSupabaseUrl(url));
  }
});
test("desktop, mobile and poster references use the gateway regardless of env drift", () => {
  const oldEnv = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = ROSTA_STORE_URL;
  try {
    const src = (origin: string) => `${origin}/storage/v1/object/public/rosta-media/theme/video.mp4?v=2`;
    const original = { desktop: src(ROSTA_SELF_HOSTED_SUPABASE_URL), mobile: src(ROSTA_RETIRED_CLOUD_URL), nested: [null, {poster: src(ROSTA_RETIRED_CLOUD_URL)}] };
    const result = rostaPublicMediaReferences(original);
    const expected = `${ROSTA_STORE_URL}/api/rosta-media/rosta-media/theme/video.mp4?v=2`;
    assert.equal(result.desktop, expected);
    assert.equal(result.mobile, expected);
    assert.equal((result.nested[1] as {poster:string}).poster, expected);
    assert.ok(original.mobile.includes(ROSTA_RETIRED_CLOUD_URL));
  } finally {
    if (oldEnv === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oldEnv;
  }
});
test("signed, authenticated, unknown bucket and foreign URLs are preserved", () => {
  const sources = [
    `${ROSTA_RETIRED_CLOUD_URL}/storage/v1/object/sign/rosta-media/a.jpg?token=private`,
    `${ROSTA_SELF_HOSTED_SUPABASE_URL}/storage/v1/object/authenticated/rosta-media/a.jpg`,
    `${ROSTA_SELF_HOSTED_SUPABASE_URL}/storage/v1/object/public/private-bucket/a.jpg`,
    "https://other.supabase.co/storage/v1/object/public/rosta-media/a.jpg",
    "/home/photo.jpg", "data:image/png;base64,aaa", "not-a-url",
  ];
  for (const source of sources) assert.equal(rostaPublicMediaUrl(source), source);
});
test("encoded public filenames, transforms and revisions survive rewriting", () => {
  const source = `${ROSTA_RETIRED_CLOUD_URL}/storage/v1/render/image/public/website-media/a%20b.jpg?width=400&v=3#focus`;
  assert.equal(rostaPublicMediaUrl(source), `${ROSTA_STORE_URL}/api/rosta-media/website-media/a%20b.jpg?width=400&v=3#focus`);
});
test("storefront media stays on the current storefront origin, including uploaded gateway URLs", () => {
  const path = "/api/rosta-media/rosta-media/theme/photo.webp?v=4";
  assert.equal(rostaPublicMediaUrl(ROSTA_STORE_URL + path, ""), path);
  assert.equal(rostaPublicMediaUrl(`${ROSTA_RETIRED_CLOUD_URL}/storage/v1/object/public/rosta-media/theme/photo.webp?v=4`, ""), path);
  assert.equal(rostaPublicMediaUrl("https://foreign.test" + path, ""), "https://foreign.test" + path);
});
test("only unique upload filenames receive immutable caching", () => {
  assert.match(rostaMediaCacheControl(["theme", "1791655453033-6a34bf0d-ee40-41bf-8f18-f795993de16d-photo.webp"]), /immutable/);
  assert.match(rostaMediaCacheControl(["uploads", "1791655453033-6a34bf0d-photo.jpg"]), /immutable/);
  assert.doesNotMatch(rostaMediaCacheControl(["theme", "logo.jpg"]), /immutable/);
});
test("a video stream can complete after the header deadline without being aborted", async () => {
  const previous = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (_url, init) => {
    signal = init?.signal;
    return new Response(new ReadableStream({start(controller) {
      setTimeout(() => {controller.enqueue(new TextEncoder().encode("video"));controller.close();}, 40);
    }}));
  };
  try {
    const response = await fetchRostaMediaHeaders("https://media.test", {}, 10);
    assert.equal(await response.text(), "video");
    assert.equal(signal?.aborted, false);
  } finally { globalThis.fetch = previous; }
});
test("unresponsive headers hit a bounded deadline", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("header timeout")), {once:true});
  });
  try { await assert.rejects(fetchRostaMediaHeaders("https://media.test", {}, 10), /header timeout/); }
  finally { globalThis.fetch = previous; }
});
