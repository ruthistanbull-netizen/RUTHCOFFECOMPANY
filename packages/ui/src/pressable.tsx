"use client";

import * as React from "react";
import {
  beginInteraction,
  cancelInteraction,
  endInteraction,
  moveInteraction,
  type InteractionCandidate,
  type InteractionPointerType,
} from "./interaction";

export type PressStrength = "subtle" | "standard" | "icon";

export type PressableOptions<T extends HTMLElement> = {
  disabled?: boolean;
  onPointerDown?: React.PointerEventHandler<T>;
  onPointerMove?: React.PointerEventHandler<T>;
  onPointerUp?: React.PointerEventHandler<T>;
  onPointerCancel?: React.PointerEventHandler<T>;
  onPointerLeave?: React.PointerEventHandler<T>;
  onKeyDown?: React.KeyboardEventHandler<T>;
  onKeyUp?: React.KeyboardEventHandler<T>;
  onBlur?: React.FocusEventHandler<T>;
};

function pointerType(value: string): InteractionPointerType {
  if (value === "touch" || value === "pen") return value;
  return "mouse";
}

function isKeyboardPress(key: string) {
  return key === "Enter" || key === " ";
}

export function usePressable<T extends HTMLElement>({
  disabled = false,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onPointerLeave,
  onKeyDown,
  onKeyUp,
  onBlur,
}: PressableOptions<T> = {}) {
  const candidateRef = React.useRef<InteractionCandidate | null>(null);
  const [pressed, setPressed] = React.useState(false);

  const clear = React.useCallback(() => {
    const candidate = candidateRef.current;
    if (candidate && candidate.phase === "candidate") cancelInteraction(candidate);
    candidateRef.current = null;
    setPressed(false);
  }, []);

  React.useEffect(() => {
    if (disabled) clear();
  }, [clear, disabled]);

  const handlePointerDown = React.useCallback<React.PointerEventHandler<T>>(
    (event) => {
      onPointerDown?.(event);
      if (event.defaultPrevented || disabled || !event.isPrimary) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      candidateRef.current = beginInteraction({
        pointerType: pointerType(event.pointerType),
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
      });
      setPressed(true);
    },
    [disabled, onPointerDown],
  );

  const handlePointerMove = React.useCallback<React.PointerEventHandler<T>>(
    (event) => {
      onPointerMove?.(event);
      const candidate = candidateRef.current;
      if (!candidate || disabled) return;

      const resolution = moveInteraction(candidate, {
        x: event.clientX,
        y: event.clientY,
        at: event.timeStamp,
      });
      if (resolution.phase !== "candidate") setPressed(false);
    },
    [disabled, onPointerMove],
  );

  const handlePointerUp = React.useCallback<React.PointerEventHandler<T>>(
    (event) => {
      onPointerUp?.(event);
      const candidate = candidateRef.current;
      if (candidate && !disabled) {
        endInteraction(candidate, {
          x: event.clientX,
          y: event.clientY,
          at: event.timeStamp,
        });
      }
      candidateRef.current = null;
      setPressed(false);
    },
    [disabled, onPointerUp],
  );

  const handlePointerCancel = React.useCallback<React.PointerEventHandler<T>>(
    (event) => {
      onPointerCancel?.(event);
      clear();
    },
    [clear, onPointerCancel],
  );

  const handlePointerLeave = React.useCallback<React.PointerEventHandler<T>>(
    (event) => {
      onPointerLeave?.(event);
      clear();
    },
    [clear, onPointerLeave],
  );

  const handleKeyDown = React.useCallback<React.KeyboardEventHandler<T>>(
    (event) => {
      onKeyDown?.(event);
      if (!event.defaultPrevented && !disabled && !event.repeat && isKeyboardPress(event.key)) {
        setPressed(true);
      }
    },
    [disabled, onKeyDown],
  );

  const handleKeyUp = React.useCallback<React.KeyboardEventHandler<T>>(
    (event) => {
      onKeyUp?.(event);
      if (isKeyboardPress(event.key)) setPressed(false);
    },
    [onKeyUp],
  );

  const handleBlur = React.useCallback<React.FocusEventHandler<T>>(
    (event) => {
      onBlur?.(event);
      clear();
    },
    [clear, onBlur],
  );

  return {
    pressed,
    pressableProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onPointerLeave: handlePointerLeave,
      onKeyDown: handleKeyDown,
      onKeyUp: handleKeyUp,
      onBlur: handleBlur,
      "data-ruth-pressed": pressed ? "true" : "false",
    } as const,
  };
}

export interface PressableProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  pressStrength?: PressStrength;
  hoverLift?: boolean;
}

export const Pressable = React.forwardRef<HTMLButtonElement, PressableProps>(function Pressable(
  {
    pressStrength = "standard",
    hoverLift = false,
    className = "",
    disabled,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onKeyDown,
    onKeyUp,
    onBlur,
    ...props
  },
  ref,
) {
  const ariaDisabled = props["aria-disabled"] === true || props["aria-disabled"] === "true";
  const inactive = Boolean(disabled || ariaDisabled);
  const { pressableProps } = usePressable<HTMLButtonElement>({
    disabled: inactive,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onPointerLeave,
    onKeyDown,
    onKeyUp,
    onBlur,
  });

  return (
    <button
      ref={ref}
      className={`ruth-pressable ${className}`.trim()}
      disabled={disabled}
      data-ruth-press-strength={pressStrength}
      data-ruth-hover-lift={hoverLift ? "true" : "false"}
      {...props}
      {...pressableProps}
    />
  );
});
