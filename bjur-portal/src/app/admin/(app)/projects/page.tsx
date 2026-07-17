import { redirect } from "next/navigation";

// Superseded by per-client project lists at /admin/clients/[id] — browsing all
// projects now starts from Clients rather than a flat cross-client list.
export default function AdminProjectsRedirect() {
  redirect("/admin/clients");
}
