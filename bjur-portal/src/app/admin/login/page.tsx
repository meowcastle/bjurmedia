import { LoginForm } from "@/components/LoginForm";

export default function AdminLoginPage() {
  return (
    <LoginForm
      portal="admin"
      kicker="Staff Control Panel"
      headA="Deliver with"
      headB="control."
      blurb="Manage client accounts, build galleries and run the media pipeline. Staff access only."
      eyebrow="Admin access"
      formTitle="Staff sign in"
      address="portal.justinbjur.com/admin"
      demoEmail="admin@bjurmedia.nyc"
      switchHref="/login"
      switchLabel="Client sign in →"
      redirectTo="/admin"
    />
  );
}
