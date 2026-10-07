"use client";

import { Minus, Plus } from "@phosphor-icons/react";
import { MAX_QUANTITY } from "@/store/cart";

/** − n + control. `min` 0 lets the minus button remove a cart line. */
export function QuantityStepper({
  value,
  onChange,
  min = 1,
  label,
  size = "md",
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  /** What's being counted, for screen readers, e.g. the product name. */
  label: string;
  size?: "md" | "lg";
}) {
  const btn = size === "lg" ? "size-11" : "size-9";
  return (
    <div className="inline-flex shrink-0 items-center rounded-full border border-line" role="group" aria-label={`Quantity of ${label}`}>
      <StepButton className={btn} label="Decrease quantity" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus size={14} />
      </StepButton>
      <span className="w-8 text-center font-mono text-sm tabular-nums" aria-live="polite">{value}</span>
      <StepButton className={btn} label="Increase quantity" disabled={value >= MAX_QUANTITY} onClick={() => onChange(value + 1)}>
        <Plus size={14} />
      </StepButton>
    </div>
  );
}

function StepButton({
  className,
  label,
  disabled,
  onClick,
  children,
}: {
  className: string;
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`grid place-items-center rounded-full transition-colors hover:bg-sunken disabled:pointer-events-none disabled:opacity-35 ${className}`}
    >
      {children}
    </button>
  );
}
