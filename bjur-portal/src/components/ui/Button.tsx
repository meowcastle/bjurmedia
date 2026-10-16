import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

/*
 * v2 buttons. Primary is an ink fill that inverts the page — near-black on paper,
 * near-white on the dark portal — and takes the accent on hover. The accent stays a
 * pointing device (kickers, links, the hover state) rather than the resting colour of
 * every confirm button, which is what let it stop meaning anything.
 */
const variantClasses: Record<Variant, string> = {
  primary: "bg-text text-bg hover:bg-accent hover:text-bg",
  secondary: "bg-transparent text-text border border-line2 hover:border-text",
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
      className={`relative px-5 py-3 text-sm font-bold uppercase tracking-wide transition-[color,background-color,border-color,transform] duration-(--dur-1) ease-std active:translate-y-px active:scale-[.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:active:scale-100 ${variantClasses[variant]} ${className}`}
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
