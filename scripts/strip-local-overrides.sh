#!/bin/bash
set -e
cd "$(dirname "$0")/.."

echo "=== Stripping redundant local CSS overrides ==="
echo ""
count=0

strip_line() {
  local file="$1"
  local pattern="$2"
  local desc="$3"
  if grep -qP "$pattern" "$file" 2>/dev/null; then
    grep -vP "$pattern" "$file" > "$file.tmp" && mv "$file.tmp" "$file"
    echo "  ✓ $desc"
    ((count++)) || true
  fi
}

echo "--- .btn--small ---"
for f in \
  "src/routes/runners/[runner_id]/+page.svelte" \
  "src/routes/submit-game/+page.svelte" \
  "src/routes/news/+page.svelte" \
  "src/routes/games/[game_id]/runs/[tier]/[category]/+page.svelte" \
  "src/routes/admin/game-updates/+page.svelte" \
  "src/routes/admin/users/+page.svelte" \
  "src/routes/admin/contributions/+page.svelte" \
  "src/routes/admin/runs/+page.svelte" \
  "src/routes/profile/theme/+page.svelte" \
  "src/routes/profile/create/+page.svelte" \
  "src/routes/profile/edit/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t\.btn--small \{ padding:' "btn--small from $(basename $(dirname $f))"
done

echo ""
echo "--- Compound lines (hover+small+disabled) ---"
for f in "src/routes/admin/reports/+page.svelte" "src/routes/admin/games/+page.svelte"; do
  [ -f "$f" ] && strip_line "$f" '^\t\.btn:hover.*\.btn--small.*\.btn:disabled' "compound from $(basename $(dirname $f))"
done
[ -f "src/routes/admin/profiles/+page.svelte" ] && strip_line "src/routes/admin/profiles/+page.svelte" '^\t\.btn:hover.*\.btn--small' "compound from profiles"

echo ""
echo "--- .btn:hover ---"
for f in \
  "src/routes/submit-game/+page.svelte" \
  "src/routes/news/+page.svelte" \
  "src/routes/games/[game_id]/runs/[tier]/[category]/+page.svelte" \
  "src/routes/games/[game_id]/rules/+page.svelte" \
  "src/routes/support/+page.svelte" \
  "src/routes/admin/game-updates/+page.svelte" \
  "src/routes/admin/games/[id]/review/+page.svelte" \
  "src/routes/admin/users/+page.svelte" \
  "src/routes/admin/contributions/+page.svelte" \
  "src/routes/admin/runs/+page.svelte" \
  "src/routes/profile/status/+page.svelte" \
  "src/routes/profile/create/+page.svelte" \
  "src/routes/profile/edit/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t\.btn:hover \{ border-color:' "btn:hover from $(basename $(dirname $f))"
done

echo ""
echo "--- .btn:disabled ---"
for f in \
  "src/routes/submit-game/+page.svelte" \
  "src/routes/news/+page.svelte" \
  "src/routes/admin/health/+page.svelte" \
  "src/routes/admin/game-updates/+page.svelte" \
  "src/routes/admin/games/[id]/review/+page.svelte" \
  "src/routes/admin/profiles/+page.svelte" \
  "src/routes/admin/users/+page.svelte" \
  "src/routes/admin/contributions/+page.svelte" \
  "src/routes/admin/runs/+page.svelte" \
  "src/routes/profile/theme/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t\.btn:disabled \{ opacity:' "btn:disabled from $(basename $(dirname $f))"
done

echo ""
echo "--- .spinner (36px block) ---"
for f in \
  "src/routes/admin/reports/+page.svelte" \
  "src/routes/admin/health/+page.svelte" \
  "src/routes/admin/staff-guides/+page.svelte" \
  "src/routes/admin/game-updates/+page.svelte" \
  "src/routes/admin/financials/+page.svelte" \
  "src/routes/admin/games/+page.svelte" \
  "src/routes/admin/profiles/+page.svelte" \
  "src/routes/admin/users/+page.svelte" \
  "src/routes/admin/game-editor/+page.svelte" \
  "src/routes/admin/debug/+page.svelte" \
  "src/routes/admin/contributions/+page.svelte" \
  "src/routes/admin/runs/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t\.spinner \{ width: 36px;' "spinner from $(basename $(dirname $f))"
done

echo ""
echo "--- @keyframes spin ---"
for f in \
  "src/routes/games/[game_id]/submit/+page.svelte" \
  "src/routes/games/[game_id]/suggest/+page.svelte" \
  "src/routes/admin/reports/+page.svelte" \
  "src/routes/admin/health/+page.svelte" \
  "src/routes/admin/staff-guides/+page.svelte" \
  "src/routes/admin/game-updates/+page.svelte" \
  "src/routes/admin/financials/+page.svelte" \
  "src/routes/admin/games/+page.svelte" \
  "src/routes/admin/profiles/+page.svelte" \
  "src/routes/admin/users/+page.svelte" \
  "src/routes/admin/game-editor/+page.svelte" \
  "src/routes/admin/debug/+page.svelte" \
  "src/routes/admin/contributions/+page.svelte" \
  "src/routes/admin/+page.svelte" \
  "src/routes/admin/runs/+page.svelte" \
  "src/routes/profile/settings/link-callback/+page.svelte" \
  "src/routes/profile/create/+page.svelte" \
  "src/routes/profile/edit/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t@keyframes spin' "@keyframes spin from $(basename $(dirname $f))"
done

echo ""
echo "--- .center / .center-sm ---"
for f in \
  "src/routes/admin/reports/+page.svelte" \
  "src/routes/admin/games/+page.svelte" \
  "src/routes/admin/profiles/+page.svelte" \
  "src/routes/admin/game-editor/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t\.center \{.*\.center-sm \{' "center+center-sm from $(basename $(dirname $f))"
done

for f in \
  "src/routes/admin/health/+page.svelte" \
  "src/routes/admin/staff-guides/+page.svelte" \
  "src/routes/admin/game-updates/+page.svelte" \
  "src/routes/admin/financials/+page.svelte" \
  "src/routes/admin/users/+page.svelte" \
  "src/routes/admin/debug/+page.svelte" \
  "src/routes/admin/contributions/+page.svelte" \
  "src/routes/admin/runs/+page.svelte" \
  "src/routes/profile/submissions/update/[id]/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t\.center \{ text-align: center;' "center from $(basename $(dirname $f))"
done

for f in \
  "src/routes/admin/game-updates/+page.svelte" \
  "src/routes/admin/users/+page.svelte" \
  "src/routes/admin/runs/+page.svelte"
do
  [ -f "$f" ] && strip_line "$f" '^\t\.center-sm \{' "center-sm from $(basename $(dirname $f))"
done

echo ""
echo "--- .spinner--small → .spinner--sm ---"
for f in \
  "src/routes/games/[game_id]/submit/+page.svelte" \
  "src/routes/games/[game_id]/suggest/+page.svelte"
do
  if [ -f "$f" ]; then
    strip_line "$f" '^\t\.spinner--small \{' "spinner--small CSS from $(basename $(dirname $f))"
    if grep -q 'spinner--small' "$f"; then
      sed -i 's/spinner--small/spinner--sm/g' "$f"
      echo "  ✓ renamed spinner--small → spinner--sm in $(basename $(dirname $f))"
    fi
  fi
done

echo ""
echo "=== Done. $count definitions stripped. ==="
echo ""
echo "MANUAL REVIEW NEEDED (multi-line blocks):"
echo "  1. admin/+page.svelte — .spinner block"
echo "  2. admin/+layout.svelte — .admin-loading .spinner block"
echo "  3. profile/create/+page.svelte — .spinner block"
echo "  4. profile/edit/+page.svelte — .spinner block"
echo "  5. profile/submissions/+page.svelte — .btn:hover / .btn:disabled"
echo "  6. support/+page.svelte — .btn:disabled block"
echo "  7. sign-in/+page.svelte — .btn:disabled block"
