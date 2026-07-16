import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";

export default async function ChangePasswordPage() {
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect("/");

  return <ChangePasswordForm />;
}
