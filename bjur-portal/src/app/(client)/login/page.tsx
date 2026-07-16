import { LoginForm } from "@/components/LoginForm";

export default function ClientLoginPage() {
  return (
    <LoginForm
      portal="client"
      kicker="Client Delivery Portal"
      headA="Your work,"
      headB="delivered."
      blurb="Secure access to your finished photo and video deliverables. Stream, review and download masters at full resolution."
      eyebrow="Sign in"
      formTitle="Welcome back"
      address="portal.bjur.media"
      demoEmail="sasha@ssh.studio"
      switchHref="/admin/login"
      switchLabel="Staff sign in →"
      redirectTo="/"
    />
  );
}
