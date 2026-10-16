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
      kicker="Admin"
      headA="Deliver with"
      headB="control."
      blurb="Manage clients, build projects and run the media pipeline. Admin access only."
      eyebrow="Admin access"
      formTitle="Admin sign in"
      demoEmail="admin@bjurmedia.nyc"
      switchHref="/login"
      switchLabel="Client sign in →"
      redirectTo="/admin"
      />
    </>
  );
}
