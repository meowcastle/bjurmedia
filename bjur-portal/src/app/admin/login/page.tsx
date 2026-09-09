import { LoginForm } from "@/components/LoginForm";
import { themeScript } from "@/lib/theme";

export default function AdminLoginPage() {
  return (
    <>
      {/* Login sits outside the portal layouts, so it needs its own stamp — without
          it the client login always rendered in the default dark. */}
      <script dangerouslySetInnerHTML={{ __html: themeScript("admin") }} />
      <LoginForm
      portal="admin"
      kicker="Staff Control Panel"
      headA="Deliver with"
      headB="control."
      blurb="Manage client accounts, build galleries and run the media pipeline. Staff access only."
      eyebrow="Admin access"
      formTitle="Staff sign in"
      demoEmail="admin@bjurmedia.nyc"
      switchHref="/login"
      switchLabel="Client sign in →"
      redirectTo="/admin"
      />
    </>
  );
}
