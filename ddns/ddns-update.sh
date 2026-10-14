#!/bin/sh
# Cloudflare DDNS updater for the Bjur Media NAS.
# Checks this network's current public IPv4 and updates the Cloudflare A
# records below whenever it changes — so an overnight ISP address change
# never takes the sites down again.
#
# Requires: curl, jq (the docker-compose service installs both).
# Config via environment:
#   CF_API_TOKEN       required — Cloudflare API token (Zone:Read + DNS:Edit
#                      on justinbjur.com and wreckroom.nyc; see README.md)
#   DDNS_RECORDS       optional — space-separated zone:record pairs to manage
#   SLACK_WEBHOOK_URL  optional — post a note to Slack when the IP changes

set -u

: "${CF_API_TOKEN:?CF_API_TOKEN is required}"
RECORDS="${DDNS_RECORDS:-justinbjur.com:justinbjur.com justinbjur.com:www.justinbjur.com justinbjur.com:portal.justinbjur.com wreckroom.nyc:wreckroom.nyc}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

api() {
  curl -fsS --max-time 20 \
    -H "Authorization: Bearer $CF_API_TOKEN" \
    -H "Content-Type: application/json" "$@"
}

# Current public IPv4 — Cloudflare's own trace endpoint first, ipify fallback.
ip=$(curl -fsS --max-time 10 https://www.cloudflare.com/cdn-cgi/trace | sed -n 's/^ip=//p')
if ! echo "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
  ip=$(curl -fsS --max-time 10 https://api.ipify.org || true)
fi
if ! echo "$ip" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
  log "ERROR: could not determine public IPv4 (got: '$ip')"
  exit 1
fi

changed=""
failed=0

for pair in $RECORDS; do
  zone="${pair%%:*}"
  name="${pair#*:}"

  zone_id=$(api "https://api.cloudflare.com/client/v4/zones?name=$zone" | jq -r '.result[0].id // empty') || zone_id=""
  if [ -z "$zone_id" ]; then
    log "ERROR: $name — zone lookup failed for $zone (token scopes?)"
    failed=1
    continue
  fi

  rec_json=$(api "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records?type=A&name=$name") || rec_json=""
  rec_id=$(echo "$rec_json" | jq -r '.result[0].id // empty')
  current=$(echo "$rec_json" | jq -r '.result[0].content // empty')
  if [ -z "$rec_id" ]; then
    log "ERROR: $name — no A record found in zone $zone"
    failed=1
    continue
  fi

  if [ "$current" = "$ip" ]; then
    log "$name — unchanged ($ip)"
    continue
  fi

  if api -X PATCH "https://api.cloudflare.com/client/v4/zones/$zone_id/dns_records/$rec_id" \
       --data "{\"content\":\"$ip\"}" >/dev/null; then
    log "$name — updated $current -> $ip"
    changed="$changed $name"
  else
    log "ERROR: $name — update call failed"
    failed=1
  fi
done

if [ -n "$changed" ] && [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
  curl -fsS --max-time 10 -X POST -H "Content-Type: application/json" \
    --data "{\"text\":\":globe_with_meridians: Home IP changed — DDNS updated$changed -> $ip\"}" \
    "$SLACK_WEBHOOK_URL" >/dev/null || log "WARN: Slack notify failed"
fi

exit $failed
