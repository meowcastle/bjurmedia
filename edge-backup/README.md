# edge-backup

Keeps bjur.nyc and justinbjur.com loading when the NAS is unreachable, the same way
sweetdreams-edge covers Sweet Dreams. A Cloudflare Worker (`bjur-backup`) sits on
both domains, asks the NAS first, and only answers from a saved copy when Cloudflare
cannot reach it. Forms and API calls return 503 while it is covering.

- Cloudflare project: Workers & Pages, `bjur-backup`, repo meowcastle/bjurmedia,
  root directory `edge-backup`, build `node build.mjs`, deploy `npx wrangler deploy`.
- The copy is taken on every deploy. Before planned downtime (moving the NAS, a DSM
  update), open the project's Deployments and retry the latest one so the copy is fresh.
- Workers Routes for both zones should be set to "Fail open", so hitting the free
  plan's daily request limit sends visitors straight to the NAS instead of an error.
- The portal is not covered: it needs the NAS for logins, uploads and playback.
