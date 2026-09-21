import { db } from "@/lib/db";
import { stateOf } from "@/lib/submissionRequests";
import { SendPageClient } from "@/components/SendPageClient";

/**
 * The public send page. No session, no nav, no portal chrome.
 *
 * The token is the whole credential, so it is the last path segment after the request's
 * name — `berlin-raws-<token>` — which reads as a thing rather than a key while still
 * being unguessable.
 */
export default async function SendPage({
  params,
}: {
  params: Promise<{ projectSlug: string; nameToken: string }>;
}) {
  const { nameToken } = await params;
  // Everything before the last hyphen is the human half of the slug; the token follows.
  const token = nameToken.slice(nameToken.lastIndexOf("-") + 1);

  const request = token
    ? await db.submissionRequest.findUnique({
        where: { token },
        include: { project: { include: { client: { select: { name: true } } } } },
      })
    : null;

  // A token that never existed is a 404. One that is closed or expired gets the page
  // shell with a sentence — the person holding it was given it by someone, and a bare
  // 404 tells them they did something wrong when they did not.
  if (!request) {
    return <SendPageClient state="missing" clientName="Bjur Media" token="" />;
  }

  const state = stateOf(request);

  return (
    <SendPageClient
      state={state === "open" ? "open" : "closed"}
      clientName={request.project.client.name}
      token={request.token}
    />
  );
}
