/**
 * The chrome-free half of the client portal.
 *
 * The review screen takes the whole window and brings its own header — a serif Bjur, the
 * cut tabs, who is watching. Rendering it inside the portal layout put the site header on
 * top of that one, so the cut tabs were behind it and unreachable.
 *
 * A route group, so the URL is unchanged: /p/[id]/review still sits beside /p/[id]. It is
 * also the right shell for the guest link, where there is no session and no portal to be
 * the header of.
 */
export default function BareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
