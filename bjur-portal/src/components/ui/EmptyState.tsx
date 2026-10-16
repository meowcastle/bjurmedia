import { FolderOpen, Files, KeyRound, Users } from "lucide-react";

const ICONS = { projects: FolderOpen, files: Files, logins: KeyRound, clients: Users } as const;

/**
 * An empty list: one line, one quiet icon, rising in like the rows it stands in for
 * (PORTAL-POLISH §3). The copy stays a single sentence — that was PORTAL-DISTILL.
 */
export function EmptyState({
  icon,
  children,
  className = "px-5 py-10",
}: {
  icon: keyof typeof ICONS;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = ICONS[icon];
  return (
    <div className={`bj-row flex flex-col items-center gap-3 text-center text-sm text-muted ${className}`}>
      <Icon size={24} strokeWidth={1.5} className="text-dim" aria-hidden />
      {children}
    </div>
  );
}
