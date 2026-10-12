#!/usr/bin/env bash
# Contract tests for zup.sh using isolated command shims; no production services
# or remote provider are contacted.
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fixture="$tmp/project"
mkdir -p "$fixture/deploy" "$fixture/bin" "$fixture/sauvegardes" "$tmp/remote"
cp "$repo/deploy/zup.sh" "$fixture/deploy/zup.sh"
cat > "$fixture/.env.production" <<'EOF'
POSTGRES_USER=zupone
POSTGRES_DB=zupone
AGE_BACKUP_RECIPIENT=age1fixture
BACKUP_REMOTE_REQUIRED=true
BACKUP_REMOTE=fixture:bucket/backups
EOF

cat > "$fixture/bin/docker" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG"
case "$*" in
  *pg_dump*) printf 'CREATE TABLE fixture (id int);\n' ;;
  *"tar czf"*) printf 'synthetic-files' ;;
  *"information_schema.tables"*) printf '0\n' ;;
  *"_prisma_migrations"*) printf '1\n' ;;
  *'SELECT count(*)'*) printf '1\n' ;;
  *'node --input-type=module'*) printf 'Prisma applicatif: 1 migrations\n' ;;
  *psql*) cat >/dev/null ;;
esac
EOF
cat > "$fixture/bin/age" <<'EOF'
#!/usr/bin/env bash
if [[ " $* " == *" -d "* && "${AGE_CORRUPT:-}" == 1 ]]; then exit 2; fi
cat
EOF
cat > "$fixture/bin/rclone" <<'EOF'
#!/usr/bin/env bash
op="$1"; shift
[[ "${RCLONE_FAIL:-}" != "$op" ]] || exit 23
file_path() { printf '%s' "$1" | tr '/:' '__'; }
case "$op" in
  copyto)
    cp "$1" "$FAKE_REMOTE_ROOT/$(file_path "$2")"
    if [[ "${RCLONE_FAIL:-}" == copyto-interrupted ]]; then truncate -s 1 "$FAKE_REMOTE_ROOT/$(file_path "$2")"; exit 143; fi
    if [[ "${RCLONE_TRUNCATE:-}" == 1 ]]; then : > "$FAKE_REMOTE_ROOT/$(file_path "$2")"; fi
    ;;
  cat) cat "$FAKE_REMOTE_ROOT/$(file_path "$1")" ;;
  moveto) mv "$FAKE_REMOTE_ROOT/$(file_path "$1")" "$FAKE_REMOTE_ROOT/$(file_path "$2")" ;;
  *) exit 2 ;;
esac
EOF
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH" FAKE_LOG="$tmp/docker.log" FAKE_REMOTE_ROOT="$tmp/remote"
export SAUVEGARDES="$fixture/sauvegardes"

assert_status() {
  grep -q "$1" "$FAKE_LOG" || { echo "status absent: $1" >&2; exit 1; }
}
run_backup() {
  : > "$FAKE_LOG"
  sed -i "s|^BACKUP_REMOTE_REQUIRED=.*|BACKUP_REMOTE_REQUIRED=$1|; s|^BACKUP_REMOTE=.*|BACKUP_REMOTE=$2|" "$fixture/.env.production"
  (cd "$fixture" && RCLONE_FAIL="${3:-}" RCLONE_TRUNCATE="${4:-}" ./deploy/zup.sh backup) >"$tmp/out" 2>&1
}

if run_backup true ""; then cat "$tmp/out" >&2; echo "destination absence should fail" >&2; exit 1; fi
assert_status "LOCAL_ONLY"
assert_status "REMOTE_FAILED"
grep -q 'aucune copie hors serveur' "$tmp/out"
test -n "$(find "$fixture/sauvegardes" -name 'base-*.sql.gz.age' -print -quit)"
test -n "$(find "$fixture/sauvegardes" -name 'uploads-*.tar.gz.age' -print -quit)"

run_backup false ""
assert_status "LOCAL_ONLY"
! grep -q 'SET status=.COMPLETED' "$FAKE_LOG"

if run_backup true fixture:bucket/backups copyto-interrupted; then echo "interrupted transfer should fail" >&2; exit 1; fi
assert_status "REMOTE_FAILED"

if run_backup true fixture:bucket/backups cat; then echo "rclone verification error should fail" >&2; exit 1; fi
assert_status "REMOTE_FAILED"

if run_backup true fixture:bucket/backups "" 1; then echo "truncated object should fail" >&2; exit 1; fi
assert_status "REMOTE_FAILED"

run_backup true fixture:bucket/backups
assert_status "SET status='COMPLETED'"
test -f "$fixture/sauvegardes"/manifest-*.txt

# A corrupt encrypted SQL input must fail before psql is asked to restore it.
base="$tmp/corrompue.sql.gz.age"
gzip -c <<< 'synthetic sql' > "$base"
tar -czf "$tmp/fichiers.tar.gz.age" -C "$tmp" docker.log
touch "$tmp/identite-age.txt"
if (cd "$fixture" && AGE_CORRUPT=1 RESTORE_TEST_DATABASE_URL='postgresql://test:secret@test-db:5432/zup_restore_test' \
  ./deploy/zup.sh restore-test "$base" "$tmp/identite-age.txt" "$tmp/fichiers.tar.gz.age") >"$tmp/restore-out" 2>&1; then
  echo "corrupt archive should fail" >&2; exit 1
fi
! grep -q 'node --input-type=module' "$FAKE_LOG"
! grep -q -- '-o /dev/null' "$FAKE_LOG"
rapport="$(find "$fixture/sauvegardes/restore-tests" -name 'restore-*.txt' -print -quit)"
test -n "$rapport"
grep -q '^result=FAILED$' "$rapport"
echo "backup-contract: 7 contract cases passed (5 failure injections; isolated mocks only)"
