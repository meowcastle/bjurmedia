import { InputHTMLAttributes, forwardRef } from "react";

/*
 * Focus is a border in the brighter accent plus a soft 3px glow, so the field in use is
 * unmistakable without the outline the browser would draw. `error` turns the border to
 * the warning colour; the message itself is Field's job.
 */
export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { error?: boolean }
>(function Input({ className = "", error = false, ...props }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={error || undefined}
      className={`w-full bg-s2 border px-4 py-3 text-sm text-text placeholder:text-dim outline-none transition-[border-color,box-shadow] duration-(--dur-1) ease-std focus:border-accentb focus:shadow-[0_0_0_3px_rgba(236,48,19,.18)] ${
        error ? "border-warn" : "border-line"
      } ${className}`}
      {...props}
    />
  );
});

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  /** A short message under the field. It fades in rather than shoving the form down. */
  error?: string | null;
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
      {error && (
        <span role="alert" className="text-[12px] text-warn bjfade">
          {error}
        </span>
      )}
    </div>
  );
}
