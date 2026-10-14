# ddns — keep Cloudflare pointed at the NAS

Watches this network's public IP every 5 minutes and updates the Cloudflare
A records when the ISP changes it. Covers:

- `justinbjur.com`, `www.justinbjur.com`, `portal.justinbjur.com`
- `wreckroom.nyc` (its `www`/`wiki` are CNAMEs to the apex, so they follow)

`sweetdreamsrvrentals.com` needs nothing — it runs on Cloudflare Tunnels,
which don't depend on the IP.

## 1. Create the API token (one time, ~2 min)

1. dash.cloudflare.com → profile icon (top right) → **API Tokens** → **Create Token**
2. Use the **Edit zone DNS** template
3. Permissions — make sure it has BOTH:
   - `Zone · DNS · Edit`
   - `Zone · Zone · Read` (add it if the template didn't)
4. Zone Resources: **Include → Specific zone → justinbjur.com**, then add a
   second row for **wreckroom.nyc**
5. Create, and copy the token — it's shown once.

## 2. Deploy on the NAS

```bash
# from /volume2/docker/bjurmedia (or wherever the repo lives on the NAS)
sudo git pull
cd ddns
cp .env.example .env
vi .env                      # paste CF_API_TOKEN (and optional SLACK_WEBHOOK_URL)
sudo docker-compose up -d
sudo docker-compose logs -f  # expect one "unchanged (…)" line per record
```

## Notes

- A failed pass just logs and retries 5 minutes later; the container
  restarts with the NAS (`restart: unless-stopped`).
- `.env` is gitignored — the token lives only on the NAS. If it ever leaks,
  revoke it in the same API Tokens screen; it can only edit DNS on these
  two zones.
- To cover another record later, add `zone:record` to `DDNS_RECORDS` in
  `docker-compose.yml`'s environment (see the default list in
  `ddns-update.sh`), then `sudo docker-compose up -d` again.
