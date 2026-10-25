import { themeScript } from "@/lib/theme";

/**
 * The chrome-free half of the client portal.
 *
 * The review screen brings its own header: the seal, the back link, the cut tabs.
 * Rendering it inside the portal layout put the site header on top of that one, so the cut
 * tabs were behind it and unreachable.
 *
 * A route group, so the URL is unchanged: /p/[id]/review still sits beside /p/[id]. It is
 * also the right shell for the guest link, where there is no session and no portal to be
 * the header of.
 */
export default function BareLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* v13: the review page follows the client's light/dark choice, so the theme is
          stamped before first paint here as the portal layout does. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      {children}
    </>
  );
}
