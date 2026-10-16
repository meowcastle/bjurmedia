import { LoginForm } from "@/components/LoginForm";
import { themeScript } from "@/lib/theme";

export default function AdminLoginPage() {
  return (
    <>
      {/* Login sits outside the portal layouts, so it needs its own stamp — without
          it the client login always rendered in the default dark. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("admin") }} />
      <LoginForm portal="admin" title="Admin · Sign in" demoEmail="admin@bjurmedia.nyc" redirectTo="/admin" />
    </>
  );
}
