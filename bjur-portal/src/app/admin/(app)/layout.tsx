import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminHeader } from "@/components/AdminHeader";
import { themeScript } from "@/lib/theme";
import { PortalFoot } from "@/components/ui/PortalFoot";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/admin/login");
  if (!session.isAdmin) notFound(); // client session hitting the staff surface

  return (
    <div className="min-h-dvh flex flex-col">
      <script dangerouslySetInnerHTML={{ __html: themeScript("admin") }} />
      <AdminHeader userName={session.name} />
      <main className="flex-1">{children}</main>
      <div className="print:hidden"><PortalFoot /></div>
    </div>
  );
}
