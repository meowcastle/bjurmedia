/**
 * The header a guest's token travels in.
 *
 * Its own module with no imports, because both a client component and a server route need
 * the name and everything else in reviewAccess reaches auth, which reaches bcrypt's native
 * binding — importing that from a "use client" file drags node-gyp-build into the browser
 * bundle and 500s the page.
 *
 * A header rather than a cookie: a cookie would follow the guest around the whole origin,
 * and a guest link is meant to grant exactly one thing.
 */
export const REVIEW_TOKEN_HEADER = "x-review-token";
