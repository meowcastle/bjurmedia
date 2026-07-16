import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full bg-s2 border border-line px-4 py-3 text-sm text-text placeholder:text-dim outline-none focus:border-accent transition-colors ${className}`}
        {...props}
      />
    );
  }
);

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-xs font-bold uppercase tracking-widest text-muted"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
