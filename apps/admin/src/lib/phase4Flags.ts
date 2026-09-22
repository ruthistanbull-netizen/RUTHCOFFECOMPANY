export function phase4OrderShippingEnabled() {
  const value = String(process.env.PHASE4_ORDER_SHIPPING_ENABLED || "true").trim().toLowerCase();
  return !["0", "false", "off", "disabled"].includes(value);
}

export function assertPhase4OrderShippingEnabled() {
  if (!phase4OrderShippingEnabled()) {
    throw new Error("Faz 4 Order + Shipping entegrasyonu geçici olarak devre dışı.");
  }
}
