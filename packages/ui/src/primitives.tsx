"use client";

import * as React from "react";
import { LoadingIndicator } from "./feedback";
import { Pressable } from "./pressable";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", loading = false, className = "", disabled, children, ...props }, ref) => (
    <Pressable
      ref={ref}
      pressStrength="standard"
      hoverLift
      className={`ruth-button ruth-button--${variant} ruth-button--${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <LoadingIndicator size="sm" /> : null}
      <span>{children}</span>
    </Pressable>
  )
);
Button.displayName = "Button";

export type IconButtonVariant = "surface" | "ghost" | "dark" | "danger";
export type IconButtonSize = "sm" | "md" | "lg";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "surface", size = "md", className = "", type = "button", children, ...props }, ref) => (
    <Pressable
      ref={ref}
      type={type}
      pressStrength="icon"
      hoverLift
      className={`ruth-icon-button ruth-icon-button--${variant} ruth-icon-button--${size} ${className}`.trim()}
      {...props}
    >
      {children}
    </Pressable>
  )
);
IconButton.displayName = "IconButton";

type FieldMessageProps = { id?: string; error?: string; hint?: string };

function FieldMessage({ id, error, hint }: FieldMessageProps) {
  if (!error && !hint) return null;
  return (
    <span id={id} className={error ? "ruth-field__error" : "ruth-field__hint"}>
      {error ?? hint}
    </span>
  );
}

export interface InputControlProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const InputControl = React.forwardRef<HTMLInputElement, InputControlProps>(
  ({ invalid = false, className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`ruth-input ${invalid ? "ruth-input--error" : ""} ${className}`.trim()}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      {...props}
    />
  )
);
InputControl.displayName = "InputControl";

export interface TextareaControlProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const TextareaControl = React.forwardRef<HTMLTextAreaElement, TextareaControlProps>(
  ({ invalid = false, className = "", ...props }, ref) => (
    <textarea
      ref={ref}
      className={`ruth-input ruth-textarea ${invalid ? "ruth-input--error" : ""} ${className}`.trim()}
      aria-invalid={invalid || props["aria-invalid"] || undefined}
      {...props}
    />
  )
);
TextareaControl.displayName = "TextareaControl";

export interface SelectControlProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const SelectControl = React.forwardRef<HTMLSelectElement, SelectControlProps>(
  ({ invalid = false, className = "", children, ...props }, ref) => (
    <span className="ruth-select-wrap">
      <select
        ref={ref}
        className={`ruth-input ruth-select ${invalid ? "ruth-input--error" : ""} ${className}`.trim()}
        aria-invalid={invalid || props["aria-invalid"] || undefined}
        {...props}
      >
        {children}
      </select>
    </span>
  )
);
SelectControl.displayName = "SelectControl";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leading?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, leading, id, className = "", ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const messageId = error || hint ? `${inputId}-message` : undefined;

    return (
      <label className="ruth-field" htmlFor={inputId}>
        {label ? <span className="ruth-field__label">{label}</span> : null}
        <span className={`ruth-input-wrap ${leading ? "ruth-input-wrap--leading" : ""}`.trim()}>
          {leading ? <span className="ruth-input-leading" aria-hidden="true">{leading}</span> : null}
          <InputControl
            ref={ref}
            id={inputId}
            invalid={Boolean(error)}
            className={className}
            aria-describedby={messageId}
            {...props}
          />
        </span>
        <FieldMessage id={messageId} error={error} hint={hint} />
      </label>
    );
  }
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, hint, id, className = "", ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const messageId = error || hint ? `${inputId}-message` : undefined;

    return (
      <label className="ruth-field" htmlFor={inputId}>
        {label ? <span className="ruth-field__label">{label}</span> : null}
        <TextareaControl
          ref={ref}
          id={inputId}
          invalid={Boolean(error)}
          className={className}
          aria-describedby={messageId}
          {...props}
        />
        <FieldMessage id={messageId} error={error} hint={hint} />
      </label>
    );
  }
);
Textarea.displayName = "Textarea";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, id, className = "", children, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    const messageId = error || hint ? `${inputId}-message` : undefined;

    return (
      <label className="ruth-field" htmlFor={inputId}>
        {label ? <span className="ruth-field__label">{label}</span> : null}
        <SelectControl
          ref={ref}
          id={inputId}
          invalid={Boolean(error)}
          className={className}
          aria-describedby={messageId}
          {...props}
        >
          {children}
        </SelectControl>
        <FieldMessage id={messageId} error={error} hint={hint} />
      </label>
    );
  }
);
Select.displayName = "Select";

export interface ChoiceProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: React.ReactNode;
  description?: React.ReactNode;
}

function Choice({ type, label, description, className = "", id, ...props }: ChoiceProps & { type: "checkbox" | "radio" }) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <label className={`ruth-choice ${className}`.trim()} htmlFor={inputId}>
      <input id={inputId} type={type} {...props} />
      <span className="ruth-choice__control" aria-hidden="true" />
      <span className="ruth-choice__copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function Checkbox(props: ChoiceProps) {
  return <Choice type="checkbox" {...props} />;
}

export function Radio(props: ChoiceProps) {
  return <Choice type="radio" {...props} />;
}

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label: React.ReactNode;
  description?: React.ReactNode;
}

export function Switch({ checked, onCheckedChange, onClick, label, description, className = "", disabled, ...props }: SwitchProps) {
  return (
    <Pressable
      {...props}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      pressStrength="subtle"
      className={`ruth-switch-row ${className}`.trim()}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) onCheckedChange?.(!checked);
      }}
    >
      <span className="ruth-switch-copy">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <span className={`ruth-switch ${checked ? "ruth-switch--checked" : ""}`} aria-hidden="true">
        <span />
      </span>
    </Pressable>
  );
}

export type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
}

export function StatusBadge({ tone = "neutral", className = "", children, ...props }: StatusBadgeProps) {
  return (
    <span className={`ruth-status ruth-status--${tone} ${className}`.trim()} {...props}>
      <span className="ruth-status__dot" aria-hidden="true" />
      {children}
    </span>
  );
}
