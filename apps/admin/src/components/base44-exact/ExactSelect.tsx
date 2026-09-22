"use client";

import { Picker, type PickerOption } from "@ruth-commerce/ui";

export type ExactSelectOption = PickerOption;

export function ExactSelect({
  value,
  onValueChange,
  options,
  label,
  placeholder = "Seçim yap",
  disabled = false,
  className = "",
  id,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ExactSelectOption[];
  label: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  return (
    <Picker
      id={id}
      value={value}
      options={options}
      onValueChange={onValueChange}
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      className={`exact-select-trigger ${className}`.trim()}
    />
  );
}
