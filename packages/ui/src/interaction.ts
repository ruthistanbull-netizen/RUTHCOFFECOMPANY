export type InteractionPointerType = "mouse" | "touch" | "pen";
export type InteractionPhase = "candidate" | "tap" | "native-scroll" | "custom-drag" | "cancelled";
export type InteractionAxis = "x" | "y" | "both";

export type InteractionPoint = {
  x: number;
  y: number;
  at: number;
};

export type InteractionCandidate = {
  pointerType: InteractionPointerType;
  start: InteractionPoint;
  last: InteractionPoint;
  startedOnHandle: boolean;
  phase: InteractionPhase;
};

export type InteractionPolicy = {
  axis?: InteractionAxis;
  tapSlopPx?: number;
  scrollThresholdPx?: number;
  dragThresholdPx?: number;
  touchDragHoldMs?: number;
  customDrag?: boolean;
};

export type InteractionResolution = {
  phase: InteractionPhase;
  deltaX: number;
  deltaY: number;
  distance: number;
};

const DEFAULT_TAP_SLOP_PX = 8;
const DEFAULT_SCROLL_THRESHOLD_PX = 10;
const DEFAULT_DRAG_THRESHOLD_PX = 6;
const DEFAULT_TOUCH_DRAG_HOLD_MS = 140;

export function beginInteraction(input: {
  pointerType: InteractionPointerType;
  x: number;
  y: number;
  at: number;
  startedOnHandle?: boolean;
}): InteractionCandidate {
  const point = { x: input.x, y: input.y, at: input.at };
  return {
    pointerType: input.pointerType,
    start: point,
    last: point,
    startedOnHandle: Boolean(input.startedOnHandle),
    phase: "candidate",
  };
}

function axisDistance(axis: InteractionAxis, deltaX: number, deltaY: number) {
  if (axis === "x") return Math.abs(deltaX);
  if (axis === "y") return Math.abs(deltaY);
  return Math.hypot(deltaX, deltaY);
}

function movementMatchesAxis(axis: InteractionAxis, deltaX: number, deltaY: number) {
  if (axis === "x") return Math.abs(deltaX) > Math.abs(deltaY);
  if (axis === "y") return Math.abs(deltaY) > Math.abs(deltaX);
  return true;
}

function commitResolution(
  candidate: InteractionCandidate,
  point: InteractionPoint,
  phase: InteractionPhase,
  deltaX: number,
  deltaY: number,
  distance: number,
): InteractionResolution {
  candidate.last = point;
  candidate.phase = phase;
  return { phase, deltaX, deltaY, distance };
}

export function moveInteraction(
  candidate: InteractionCandidate,
  point: InteractionPoint,
  policy: InteractionPolicy = {},
): InteractionResolution {
  const deltaX = point.x - candidate.start.x;
  const deltaY = point.y - candidate.start.y;
  const distance = Math.hypot(deltaX, deltaY);

  if (candidate.phase !== "candidate") {
    candidate.last = point;
    return {
      phase: candidate.phase,
      deltaX,
      deltaY,
      distance,
    };
  }

  const axis = policy.axis ?? "both";
  const tapSlopPx = policy.tapSlopPx ?? DEFAULT_TAP_SLOP_PX;
  const dragThresholdPx = policy.dragThresholdPx ?? DEFAULT_DRAG_THRESHOLD_PX;
  const scrollThresholdPx = policy.scrollThresholdPx ?? Math.max(DEFAULT_SCROLL_THRESHOLD_PX, dragThresholdPx);
  const touchDragHoldMs = policy.touchDragHoldMs ?? DEFAULT_TOUCH_DRAG_HOLD_MS;
  const intendedDistance = axisDistance(axis, deltaX, deltaY);
  const matchesAxis = movementMatchesAxis(axis, deltaX, deltaY);
  const customDrag = Boolean(policy.customDrag && candidate.startedOnHandle);

  if (distance <= tapSlopPx) {
    return commitResolution(candidate, point, "candidate", deltaX, deltaY, distance);
  }

  if (customDrag) {
    const heldLongEnough = point.at - candidate.start.at >= touchDragHoldMs;
    const thresholdReached = intendedDistance >= dragThresholdPx;

    if (candidate.pointerType !== "touch" && thresholdReached && matchesAxis) {
      return commitResolution(candidate, point, "custom-drag", deltaX, deltaY, distance);
    }

    if (candidate.pointerType === "touch") {
      if (!heldLongEnough) {
        return commitResolution(candidate, point, "candidate", deltaX, deltaY, distance);
      }
      // A caller that explicitly opts a touch handle/surface into zero-hold drag
      // already owns the gesture. Once movement on the intended axis clears the
      // drag threshold, a small diagonal component must not demote that gesture
      // to native-scroll. Hold-based touch drags still require axis dominance.
      const trustsImmediateHandle = touchDragHoldMs === 0;
      if (thresholdReached && (matchesAxis || trustsImmediateHandle)) {
        return commitResolution(candidate, point, "custom-drag", deltaX, deltaY, distance);
      }
    }
  }

  if (distance >= scrollThresholdPx) {
    return commitResolution(candidate, point, "native-scroll", deltaX, deltaY, distance);
  }

  return commitResolution(candidate, point, "candidate", deltaX, deltaY, distance);
}

export function endInteraction(
  candidate: InteractionCandidate,
  point: InteractionPoint,
  policy: InteractionPolicy = {},
): InteractionResolution {
  const moved = moveInteraction(candidate, point, policy);
  if (moved.phase !== "candidate") return moved;

  const tapSlopPx = policy.tapSlopPx ?? DEFAULT_TAP_SLOP_PX;
  const phase = moved.distance <= tapSlopPx ? "tap" : "cancelled";
  return commitResolution(candidate, point, phase, moved.deltaX, moved.deltaY, moved.distance);
}

export function cancelInteraction(candidate: InteractionCandidate): InteractionCandidate {
  candidate.phase = "cancelled";
  return candidate;
}

export type ReorderKeyboardKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

export function reorderIndexForKey(input: {
  key: string;
  index: number;
  length: number;
  axis?: "x" | "y";
}): number | null {
  const { key, index, length } = input;
  const axis = input.axis ?? "y";
  if (length <= 1 || index < 0 || index >= length) return null;

  if (key === "Home") return index === 0 ? null : 0;
  if (key === "End") return index === length - 1 ? null : length - 1;

  const previousKey = axis === "y" ? "ArrowUp" : "ArrowLeft";
  const nextKey = axis === "y" ? "ArrowDown" : "ArrowRight";
  if (key === previousKey) return index > 0 ? index - 1 : null;
  if (key === nextKey) return index < length - 1 ? index + 1 : null;
  return null;
}

export function reorderItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return [...items];
  }
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
