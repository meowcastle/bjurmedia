/**
 * Theme constants and the pre-paint script.
 *
 * Deliberately not a "use client" module: the layouts are server components and need to
 * inline the script into the document, which they cannot do by calling into a client
 * file. ThemeToggle imports these same constants so the two can never disagree about
 * which key holds what.
 */
export type Portal = "client" | "admin";

export const THEME_KEY: Record<Portal, string> = {
  client: "bjur:v2:themeC",
  admin: "bjur:v2:themeA",
};

/** Clients default light, staff default dark. */
export const THEME_FALLBACK: Record<Portal, "light" | "dark"> = {
  client: "light",
  admin: "dark",
};

/**
 * Runs before first paint, inlined in the layout.
 *
 * Without it the page renders in the default theme and corrects itself once React
 * hydrates — a flash of the wrong ground on every navigation.
 */
export function themeScript(portal: Portal) {
  const key = JSON.stringify(THEME_KEY[portal]);
  const fallback = JSON.stringify(THEME_FALLBACK[portal]);
  return `(function(){try{var v=localStorage.getItem(${key});
document.documentElement.setAttribute('data-theme',(v==='light'||v==='dark')?v:${fallback});
}catch(e){document.documentElement.setAttribute('data-theme',${fallback});}})();`;
}
