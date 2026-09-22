export const RUTHIE_WELCOME_POINTS = 1000;
export const RUTHIE_POINTS_PER_TL = 10;

const RUTHIE_REWARD_STORAGE_KEY = "rosta-points-state-v1";
export const RUTHIE_PENDING_ORDER_KEY = "rosta-pending-order-reward-v1";
export const RUTHIE_POINTS_UPDATED_EVENT = "rosta-points-updated";

export type RuthieRewardState = {
  welcomeClaimed: boolean;
  orderPoints: number;
  spentPoints: number;
  rewardedOrderKeys: string[];
  spentOrderKeys: string[];
  updatedAt: string | null;
};

export type PendingRuthieOrderReward = {
  orderKey: string;
  orderNo?: string | null;
  totalAmount: number;
  pointsToEarn: number;
  pointsUsed: number;
  createdAt: string;
};

const defaultRewardState: RuthieRewardState = {
  welcomeClaimed: false,
  orderPoints: 0,
  spentPoints: 0,
  rewardedOrderKeys: [],
  spentOrderKeys: [],
  updatedAt: null,
};

function canUseWindow() {
  return typeof window !== "undefined";
}

function emitRewardUpdate() {
  if (!canUseWindow()) return;
  window.dispatchEvent(new Event(RUTHIE_POINTS_UPDATED_EVENT));
}

function cleanNumber(value: unknown) {
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : 0;
}

function cleanStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function formatRuthieNumber(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value);
}

export function getRuthieRewardState(): RuthieRewardState {
  if (!canUseWindow()) return defaultRewardState;

  try {
    const stored = window.localStorage.getItem(RUTHIE_REWARD_STORAGE_KEY);
    if (!stored) return defaultRewardState;

    const parsed = JSON.parse(stored) as Partial<RuthieRewardState>;
    return {
      welcomeClaimed: Boolean(parsed.welcomeClaimed),
      orderPoints: cleanNumber(parsed.orderPoints),
      spentPoints: cleanNumber(parsed.spentPoints),
      rewardedOrderKeys: cleanStringList(parsed.rewardedOrderKeys),
      spentOrderKeys: cleanStringList(parsed.spentOrderKeys),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return defaultRewardState;
  }
}

export function setRuthieRewardState(nextState: RuthieRewardState) {
  if (!canUseWindow()) return;
  window.localStorage.setItem(
    RUTHIE_REWARD_STORAGE_KEY,
    JSON.stringify({ ...nextState, updatedAt: new Date().toISOString() })
  );
  emitRewardUpdate();
}

export function grantRuthieWelcomePoints() {
  const current = getRuthieRewardState();
  if (current.welcomeClaimed) return current;

  const nextState: RuthieRewardState = {
    ...current,
    welcomeClaimed: true,
    updatedAt: new Date().toISOString(),
  };
  setRuthieRewardState(nextState);
  return nextState;
}


export function makeRuthieOrderRewardKey(orderNo?: string | null) {
  return orderNo ? `order:${orderNo}` : `checkout:${Date.now()}`;
}

export function pointsForOrderTotal(totalAmount: number) {
  return Math.max(0, Math.floor(Number(totalAmount || 0)));
}

export function savePendingRuthieOrderReward(payload: Omit<PendingRuthieOrderReward, "createdAt">) {
  if (!canUseWindow()) return;
  const safePayload: PendingRuthieOrderReward = {
    orderKey: payload.orderKey,
    orderNo: payload.orderNo || null,
    totalAmount: Number(payload.totalAmount || 0),
    pointsToEarn: Math.max(0, Math.floor(Number(payload.pointsToEarn || 0))),
    pointsUsed: Math.max(0, Math.floor(Number(payload.pointsUsed || 0))),
    createdAt: new Date().toISOString(),
  };
  window.sessionStorage.setItem(RUTHIE_PENDING_ORDER_KEY, JSON.stringify(safePayload));
}

export function getPendingRuthieOrderReward() {
  if (!canUseWindow()) return null;
  try {
    const stored = window.sessionStorage.getItem(RUTHIE_PENDING_ORDER_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as Partial<PendingRuthieOrderReward>;
    const orderKey = typeof parsed.orderKey === "string" ? parsed.orderKey : makeRuthieOrderRewardKey(parsed.orderNo);
    return {
      orderKey,
      orderNo: typeof parsed.orderNo === "string" ? parsed.orderNo : null,
      totalAmount: Number(parsed.totalAmount || 0),
      pointsToEarn: Math.max(0, Math.floor(Number(parsed.pointsToEarn || 0))),
      pointsUsed: Math.max(0, Math.floor(Number(parsed.pointsUsed || 0))),
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
    } satisfies PendingRuthieOrderReward;
  } catch {
    return null;
  }
}

export function clearPendingRuthieOrderReward() {
  if (!canUseWindow()) return;
  window.sessionStorage.removeItem(RUTHIE_PENDING_ORDER_KEY);
}

export function grantRuthieOrderPoints({
  orderKey,
  points,
}: {
  orderKey: string;
  points: number;
}) {
  const current = getRuthieRewardState();
  const safePoints = Math.max(0, Math.floor(Number(points || 0)));
  if (!orderKey || safePoints <= 0 || current.rewardedOrderKeys.includes(orderKey)) return current;

  const nextState: RuthieRewardState = {
    ...current,
    orderPoints: current.orderPoints + safePoints,
    rewardedOrderKeys: [...current.rewardedOrderKeys, orderKey],
    updatedAt: new Date().toISOString(),
  };
  setRuthieRewardState(nextState);
  return nextState;
}

export function consumeRuthiePoints({
  orderKey,
  points,
}: {
  orderKey: string;
  points: number;
}) {
  const current = getRuthieRewardState();
  const safePoints = Math.max(0, Math.floor(Number(points || 0)));
  if (!orderKey || safePoints <= 0 || current.spentOrderKeys.includes(orderKey)) return current;

  const nextState: RuthieRewardState = {
    ...current,
    spentPoints: current.spentPoints + safePoints,
    spentOrderKeys: [...current.spentOrderKeys, orderKey],
    updatedAt: new Date().toISOString(),
  };
  setRuthieRewardState(nextState);
  return nextState;
}

export function calculateRuthiePoints({
  isLoggedIn,
  paidOrderTotal = 0,
  birthdayPoints = 0,
}: {
  isLoggedIn: boolean;
  paidOrderTotal?: number;
  birthdayPoints?: number;
}) {
  if (!isLoggedIn) {
    return {
      totalPoints: 0,
      welcomePoints: 0,
      orderPoints: 0,
      storedOrderPoints: 0,
      spentPoints: 0,
      discountValue: 0,
      state: getRuthieRewardState(),
    };
  }

  const state = getRuthieRewardState();
  const welcomePoints = state.welcomeClaimed ? RUTHIE_WELCOME_POINTS : 0;
  const paidOrderPoints = Math.max(0, Math.floor(Number(paidOrderTotal || 0)));
  const orderPoints = Math.max(state.orderPoints, paidOrderPoints);
  const spentPoints = Math.max(0, Math.floor(Number(state.spentPoints || 0)));
  const safeBirthdayPoints = Math.max(0, Math.floor(Number(birthdayPoints || 0)));
  const totalPoints = Math.max(0, welcomePoints + safeBirthdayPoints + orderPoints - spentPoints);
  const discountValue = Math.floor(totalPoints / RUTHIE_POINTS_PER_TL);

  return {
    totalPoints,
    welcomePoints,
    birthdayPoints: safeBirthdayPoints,
    orderPoints,
    storedOrderPoints: state.orderPoints,
    spentPoints,
    discountValue,
    state,
  };
}

export function pointsToLira(points: number) {
  return Math.floor(Math.max(0, points) / RUTHIE_POINTS_PER_TL);
}

export function liraToPoints(lira: number) {
  return Math.max(0, Math.round(lira * RUTHIE_POINTS_PER_TL));
}
