import type { Metadata } from "next";
import { themeScript } from "@/lib/theme";
import { safeNext } from "@/lib/nextPath";
import { findUsableReset } from "@/lib/passwordReset";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";

// The token is in the path: never hand it to another site as a referrer.
export const metadata: Metadata = { title: "Choose a new password", referrer: "no-referrer" };

export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token } = await params;
  const next = safeNext((await searchParams).next) ?? "/";
  const row = await findUsableReset(token);
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: themeScript("client") }} />
      <ResetPasswordForm token={token} email={row?.user.email ?? null} redirectTo={next} />
    </>
  );
}
