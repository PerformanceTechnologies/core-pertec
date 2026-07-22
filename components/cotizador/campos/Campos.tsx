"use client";

import { useState } from "react";
import { money } from "@/lib/cotizador/formato";

const BASE =
  "h-8 w-full rounded-md border border-borde bg-white px-2 text-sm text-tinta outline-none focus:border-naranjo/50 disabled:bg-crema disabled:text-tinta/50";

/**
 * Input numérico controlado. Muestra el valor formateado (moneda o número
 * simple) fuera de foco, y el número crudo mientras se edita — igual patrón
 * que el Cotizador standalone (apps/web/src/components/Field.tsx).
 */
export function NumInput({
  value,
  onChange,
  format = "money",
  align = "right",
  disabled,
  className = "",
  title,
}: {
  value: number;
  onChange: (v: number) => void;
  format?: "money" | "plain";
  align?: "right" | "center" | "left";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const display = focused ? draft : format === "money" ? money(value) : String(value);
  const alineacion = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";

  return (
    <input
      title={title}
      value={display}
      disabled={disabled}
      inputMode="decimal"
      onFocus={() => {
        setDraft(String(value));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const parsed = Number(raw.replace(/[^0-9.-]/g, ""));
        if (!Number.isNaN(parsed)) onChange(parsed);
      }}
      className={`${BASE} ${alineacion} tabular-nums ${className}`}
    />
  );
}

export function TextInput({
  value,
  onChange,
  disabled,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${BASE} ${className}`}
    />
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
  disabled,
  className = "",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className={`${BASE} cursor-pointer disabled:cursor-default ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function DeleteButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Eliminar"
      className="inline-flex p-1 text-tinta/40 transition hover:text-red-600 disabled:opacity-40"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  );
}

export function Badge({ children, tono = "gris" }: { children: React.ReactNode; tono?: "gris" | "teal" | "naranjo" }) {
  const clases =
    tono === "teal" ? "bg-teal/10 text-teal" : tono === "naranjo" ? "bg-naranjo/10 text-naranjo" : "bg-gris/10 text-gris";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${clases}`}>{children}</span>;
}
