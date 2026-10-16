import { LoginForm } from "@/components/LoginForm";
import { themeScript } from "@/lib/theme";

export default function ClientLoginPage() {
  return (
    <>
      {/* Login sits outside the portal layouts, so it needs its own stamp — without
          it the client login always rendered in the default dark. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      <LoginForm portal="client" title="Sign in" demoEmail="sasha@ssh.studio" redirectTo="/" />
    </>
  );
}
