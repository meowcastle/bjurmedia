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

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }
>(function Button({ variant = "primary", className = "", ...props }, ref) {
  return (
    <button
      ref={ref}
      className={`px-5 py-3 text-sm font-bold uppercase tracking-wide transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
});
