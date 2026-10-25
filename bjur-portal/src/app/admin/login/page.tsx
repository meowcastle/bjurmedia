import { LoginForm } from "@/components/LoginForm";
import { themeScript } from "@/lib/theme";
import { showMovedNotice } from "@/lib/moved";

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  return (
    <>
      {/* Login sits outside the portal layouts, so it needs its own stamp — without
          it the client login always rendered in the default dark. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("admin") }} />
      <LoginForm portal="admin" label="Studio" demoEmail="you@bjur.nyc" redirectTo="/admin" moved={showMovedNotice(from)} />
    </>
  );
}
