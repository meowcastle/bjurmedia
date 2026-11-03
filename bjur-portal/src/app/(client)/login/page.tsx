import { LoginForm } from "@/components/LoginForm";
import { themeScript } from "@/lib/theme";
import { showMovedNotice } from "@/lib/moved";
import { safeNext } from "@/lib/nextPath";

export default async function ClientLoginPage({ searchParams }: { searchParams: Promise<{ from?: string; next?: string }> }) {
  const { from, next } = await searchParams;
  return (
    <>
      {/* Login sits outside the portal layouts, so it needs its own stamp — without
          it the client login always rendered in the default dark. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      <LoginForm portal="client" label="Client portal" demoEmail="you@company.com" redirectTo={safeNext(next) ?? "/"} moved={showMovedNotice(from)} />
    </>
  );
}
