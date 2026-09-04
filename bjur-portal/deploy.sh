#!/bin/sh
#
# Deploy the portal on the NAS. Run with sudo, from anywhere:
#
#     sudo /volume2/docker/bjurmedia/bjur-portal/deploy.sh
#
# Why this exists rather than `docker-compose up -d --build web worker`:
#
# The database is SQLite on a shared volume. Most migrations rebuild a table, because
# SQLite cannot add a column to a table that has constraints — it creates a new table,
# copies the rows, drops the old one and renames. That needs an exclusive lock, and any
# other open connection blocks it. The web container holds connections open in WAL mode
# for as long as it is running, so a migration attempted while web is up fails with
# "database is locked", every time, indefinitely.
#
# So the order matters: build, take everything down, migrate against a quiet database,
# bring it back. That is a short outage (tens of seconds) and it is unavoidable with
# this storage engine — the alternative is a failed migration or a crash-looping worker.
#
# Safe to run when there is nothing to migrate; `migrate deploy` is a no-op then.

set -eu

cd "$(dirname "$0")"

DB=data/bjur.db
STAMP=$(date +%Y%m%d-%H%M%S)

echo "==> Backing up the database"
if [ -f "$DB" ]; then
  # .backup, not cp: a plain copy of the .db file misses whatever is still sitting in
  # the -wal, which is routinely megabytes. Restoring such a copy loses recent writes.
  sqlite3 "$DB" ".backup 'data/bjur.db.safebak-$STAMP'"
  echo "    data/bjur.db.safebak-$STAMP"
else
  echo "    no database yet, skipping"
fi

# Pull first. This script used to build whatever happened to be checked out, which
# meant a deploy could run start to finish, report success, and ship the previous
# release — the same silent no-op as the --force-recreate bug below, in a different
# place. The commit is now printed before the build as well as after, so a stale
# checkout is visible rather than something you find out about later.
# Git runs as whoever owns the repo, not as root. Two reasons, both of which bite:
# objects written by root in a justin-owned repo leave files the owner can no longer
# update, and the HTTPS remote's credentials live in the owner's home, not root's.
REPO_OWNER=$(stat -c '%U' ../.git 2>/dev/null || echo root)
git_as() {
  if [ "$(id -un)" = "$REPO_OWNER" ]; then
    git -C .. "$@"
  else
    sudo -u "$REPO_OWNER" git -C .. "$@"
  fi
}

echo "==> Fetching as $REPO_OWNER"
if ! git_as fetch --quiet origin; then
  echo "    Could not reach origin. Deploying what is already checked out." >&2
fi

BEHIND=$(git_as rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
DIRTY=$(git_as status --porcelain | wc -l | tr -d ' ')

if [ "$DIRTY" != "0" ]; then
  echo "    Working tree has $DIRTY uncommitted change(s) — not pulling."
  echo "    Deploying what is checked out. Commit or stash them if that is not what you want."
elif [ "$BEHIND" = "0" ]; then
  echo "    Already up to date with origin/main."
else
  echo "    $BEHIND commit(s) behind origin/main:"
  git_as log --oneline HEAD..origin/main | sed 's/^/      /'
  # --ff-only: a deploy is not the place to resolve a merge.
  git_as pull --ff-only --quiet origin main
  echo "    Pulled."
fi

echo "==> Deploying commit"
git_as log --oneline -1 | sed 's/^/    /'

echo "==> Building images"
docker-compose build web worker

echo "==> Stopping web and worker (migrations need the database quiet)"
docker-compose stop web worker

echo "==> Applying migrations"
# --no-deps so this does not drag web back up and re-take the lock we just released.
docker-compose run --rm --no-deps worker npx prisma migrate deploy

echo "==> Starting worker and web"
# --force-recreate matters. These containers were stopped rather than removed, and a
# plain `up -d` will start the existing ones again — image ID unchanged, new build
# ignored. That failed silently: the images were rebuilt, the containers came back
# healthy, and production carried on serving the previous release.
docker-compose up -d --force-recreate worker web

echo "==> Status"
docker-compose ps

echo
echo "==> Running commit"
git_as log --oneline -1 2>/dev/null || true

cat <<'NOTE'

==> Done. Worth a glance:

    docker logs bjur-portal-worker-1 --tail 20    # schedulers started?
    curl -sI https://portal.justinbjur.com/login  # portal answering?

If the migration failed, web and worker are still down on purpose. The backup
printed above is a straight file copy back into place.
NOTE
