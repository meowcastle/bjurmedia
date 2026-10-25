import { LoginForm } from "@/components/LoginForm";
import { themeScript } from "@/lib/theme";
import { showMovedNotice } from "@/lib/moved";

export default async function ClientLoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <>
      {/* Login sits outside the portal layouts, so it needs its own stamp — without
          it the client login always rendered in the default dark. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      <LoginForm portal="client" label="Client portal" demoEmail="you@company.com" redirectTo="/" moved={showMovedNotice(from)} />
    </>
  );
}
