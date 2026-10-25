import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

/*
 * v13 buttons, as bjur.nyc: primary is a shu fill with white type, secondary a rule
 * outline that inks on hover, ghost a plain text button. Shu is the only action colour,
 * so a client's own colour never reaches a button.
 */
const variantClasses: Record<Variant, string> = {
  primary: "bg-accent text-white hover:bg-accentb",
  secondary: "bg-transparent text-text shadow-[inset_0_0_0_1px_var(--line)] hover:shadow-[inset_0_0_0_1px_var(--text)]",
  ghost: "bg-transparent text-muted hover:text-text",
};

/*
 * Press sinks the button a pixel and a hair smaller (--dur-1), so a tap is felt before
 * whatever it starts has answered. `loading` swaps the label for a spinner without the
 * button changing width — the label stays in the layout, invisible, holding the size.
 */
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }
>(function Button({ variant = "primary", loading = false, className = "", children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`relative px-4 py-[11px] text-sm font-semibold [border-radius:3px!important] transition-[color,background-color,box-shadow,transform] duration-(--dur-1) ease-std active:translate-y-px active:scale-[.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:scale-100 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      <span className={loading ? "invisible" : undefined}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full bjspin" />
        </span>
      )}
    </button>
  );
});
