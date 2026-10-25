/**
 * The move from portal.justinbjur.com (v13 §6). The Cloudflare redirect adds ?from=jb, and
 * for 60 days after it goes on the sign-in page says where the portal went. Old sessions
 * belong to the old host, so everyone signs in once more; this line is what tells them
 * the login is the same. MOVED_NOTICE_UNTIL (YYYY-MM-DD) moves the end date without a deploy.
 */
const UNTIL = process.env.MOVED_NOTICE_UNTIL || "2027-01-15";

export function showMovedNotice(from: string | string[] | undefined, now = new Date()) {
  return from === "jb" && now < new Date(`${UNTIL}T23:59:59`);
}
