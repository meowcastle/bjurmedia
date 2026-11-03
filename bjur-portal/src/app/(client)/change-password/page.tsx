import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { safeNext } from "@/lib/nextPath";

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next) ?? "/";
  const session = await getSessionUser();
  if (!session) redirect("/login");
  if (!session.mustChangePassword) redirect(next);

  return <ChangePasswordForm redirectTo={next} />;
}
