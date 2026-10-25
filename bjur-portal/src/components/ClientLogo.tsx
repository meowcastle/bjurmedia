import { initials } from "@/lib/initials";

/** What a staff row needs to show a client: its logo, or initials on its colour. */
export type ClientMark = { name: string; logoUrl: string | null; logoColor: string | null };

/** Ash: the colour a client gets when its logo has none, or there is no logo yet. */
export const CLIENT_ASH = "#8C887C";

/**
 * A client's round logo (v13 §4): 40px on the clients list, 20 to 22px on Today's rows.
 * With no logo, its initials on the client's colour. The colour is for marks and the 3px
 * row accent only; it never reaches a button.
 */
export function ClientLogo({ client, size }: { client: ClientMark; size: number }) {
  if (client.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a saved 256px square served by /api/logos
      <img
        className="bj-lg"
        src={client.logoUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="bj-av"
      aria-hidden
      style={{
        width: size,
        height: size,
        background: client.logoColor ?? CLIENT_ASH,
        fontSize: size >= 32 ? 12 : Math.max(8, Math.round(size * 0.42)),
      }}
    >
      {initials(client.name)}
    </span>
  );
}
