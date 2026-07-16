import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { AdminHeader } from "@/components/AdminHeader";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionUser();
  if (!session) redirect("/admin/login");
  if (!session.isAdmin) notFound(); // client session hitting the staff surface

  return (
    <div>
      <AdminHeader userName={session.name} />
      {children}
    </div>
  );
}
