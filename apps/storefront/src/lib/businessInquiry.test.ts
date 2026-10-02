import test from "node:test";
import assert from "node:assert/strict";
import {
  initialBusinessInquiry, normalizeBusinessInquiry, validateBusinessInquiry,
  businessInquiryMessage, businessToday, slotIsPast, TIME_SLOTS, STUDIO_SERVICES,
} from "./businessInquiry.ts";

const now = new Date("2026-10-02T05:00:00Z");
function valid() {
  return { ...initialBusinessInquiry("studio"), businessName: "Örnek Kafe", contactName: "Örnek Yetkili", email: "ornek@example.invalid", phone: "+90 555 000 00 00", businessType: "Kafe", city: "İstanbul / Kadıköy", needs: "Kahve programımızı geliştirmek istiyoruz.", services: [STUDIO_SERVICES[4]], date: "2026-10-03", time: TIME_SLOTS[0], meeting: "online" };
}

test("only the five requested one-hour slots are accepted", () => {
  assert.deepEqual(TIME_SLOTS, ["09:00 - 10:00", "11:00 - 12:00", "13:00 - 14:00", "15:00 - 16:00", "17:00 - 18:00"]);
  for (const time of TIME_SLOTS) assert.deepEqual(validateBusinessInquiry({ ...valid(), time }, now), {});
  assert.ok(validateBusinessInquiry({ ...valid(), time: "10:30 - 11:30" }, now).time);
});
test("Istanbul dates and elapsed time slots are validated without UTC shifts", () => {
  assert.equal(businessToday(new Date("2026-10-02T22:30:00Z")), "2026-10-03");
  assert.ok(validateBusinessInquiry({ ...valid(), date: "2026-10-01" }, now).date);
  assert.ok(validateBusinessInquiry({ ...valid(), date: "2026-02-30" }, now).date);
  assert.equal(slotIsPast("2026-10-02", TIME_SLOTS[0], new Date("2026-10-02T06:00:00Z")), true);
  assert.equal(slotIsPast("2026-10-02", TIME_SLOTS[1], new Date("2026-10-02T06:00:00Z")), false);
});
test("address is required only for in-person meetings and omitted otherwise", () => {
  const form = { ...valid(), meeting: "in_person", address: "" };
  assert.ok(validateBusinessInquiry(form, now).address);
  form.address = "Örnek Sokak No: 5, Kadıköy / İstanbul";
  assert.deepEqual(validateBusinessInquiry(form, now), {});
  assert.match(businessInquiryMessage(form), /Görüşme adresi: Örnek Sokak/);
  form.meeting = "phone";
  assert.deepEqual(validateBusinessInquiry(form, now), {});
  assert.doesNotMatch(businessInquiryMessage(form), /Görüşme adresi:/);
});
test("wholesale requests carry consumption, usage and cupping, not Studio services", () => {
  const form = { ...valid(), context: "wholesale" as const, monthlyKg: "25.5", usage: "Espresso", cupping: true, services: [] };
  assert.deepEqual(validateBusinessInquiry(form, now), {});
  const message = businessInquiryMessage(form);
  assert.match(message, /Toptan Kahve — Görüşme talebi/);
  assert.match(message, /25.5 kg/);
  assert.match(message, /Cupping talebi: Evet/);
  assert.doesNotMatch(message, /Hizmetler:/);
  assert.ok(validateBusinessInquiry({ ...form, monthlyKg: "-2" }, now).monthlyKg);
  assert.ok(validateBusinessInquiry({ ...form, monthlyKg: "Infinity" }, now).monthlyKg);
});
test("malformed requests, invalid contacts and unknown services fail validation", () => {
  for (const payload of [null, [], "request", {}]) assert.ok(Object.keys(validateBusinessInquiry(normalizeBusinessInquiry(payload), now)).length);
  assert.ok(validateBusinessInquiry({ ...valid(), email: "invalid", phone: "hi" }, now).email);
  assert.ok(validateBusinessInquiry({ ...valid(), email: "invalid", phone: "hi" }, now).phone);
  assert.ok(validateBusinessInquiry({ ...valid(), services: ["Unknown service"] }, now).services);
});
test("the longest permitted request fits the existing contact inbox without truncation", () => {
  const form = { ...valid(), businessName: "İ".repeat(120), city: "İ".repeat(120), website: "a".repeat(240), needs: "İ".repeat(1800), services: [...STUDIO_SERVICES], meeting: "in_person", address: "İ".repeat(600) };
  assert.deepEqual(validateBusinessInquiry(form, now), {});
  assert.ok(businessInquiryMessage(form).length <= 4000);
  assert.ok(validateBusinessInquiry({ ...form, needs: "İ".repeat(1801) }, now).needs);
});
