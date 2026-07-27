# Deploying to the NAS

Live at **portal.justinbjur.com**, Synology NAS, `/volume2/docker/bjurmedia/bjur-portal`.
Uses the legacy hyphenated `docker-compose` CLI (not `docker compose`), needs `sudo`
for the docker socket. Reverse proxy / DNS / certificate are already set up —
this covers pushing an update to already-live containers.

## No schema change

```bash
cd /volume2/docker/bjurmedia/bjur-portal
sudo git pull
sudo docker-compose build web        # + worker too if worker.ts or src/lib changed
sudo docker-compose up -d web        # + worker
```

## Schema change (a new Prisma migration is in the commit)

**Order matters**: build *before* migrating. `docker-compose run --rm worker`
uses whichever worker image is already built — running `migrate deploy`
before `build` runs it against the *old* image and silently does nothing
against the new migration, which then never gets applied even though `up -d`
starts the new code expecting it. (This bit us once in production — the
symptom was a 500 on every page touching the new table, `P2021: table does
not exist`, discovered via `docker-compose run --rm worker npx prisma
migrate status` showing the migration as still pending.)

```bash
cd /volume2/docker/bjurmedia/bjur-portal
sudo git pull
sudo docker-compose stop web worker
sudo docker-compose build web worker
sudo docker-compose run --rm worker npx prisma migrate deploy
sudo docker-compose up -d web worker
```

Stopping both containers first also avoids a separate "database is locked"
failure — `migrate deploy` needs an exclusive lock on the SQLite file, which
running `web`/`worker` processes hold open.

## After deploying

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://portal.justinbjur.com/        # expect 307 → /login
curl -s -o /dev/null -w "%{http_code}\n" https://portal.justinbjur.com/login   # expect 200
sudo docker-compose logs web --tail=30     # confirm no fresh errors after the restart
sudo docker-compose ps                     # both containers Up
```
