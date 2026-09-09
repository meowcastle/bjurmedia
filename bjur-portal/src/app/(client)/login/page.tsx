import { LoginForm } from "@/components/LoginForm";
import { themeScript } from "@/lib/theme";

export default function ClientLoginPage() {
  return (
    <>
      {/* Login sits outside the portal layouts, so it needs its own stamp — without
          it the client login always rendered in the default dark. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      <LoginForm
      portal="client"
      kicker="Client Delivery Portal"
      headA="Your work,"
      headB="delivered."
      blurb="Secure access to your finished photo and video deliverables. Stream, review and download masters at full resolution."
      eyebrow="Sign in"
      formTitle="Welcome back"
      demoEmail="sasha@ssh.studio"
      switchHref="/admin/login"
      switchLabel="Staff sign in →"
      redirectTo="/"
      />
    </>
  );
}
