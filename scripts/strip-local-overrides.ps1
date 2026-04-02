# strip-local-overrides.ps1
# Run from repo root: powershell -ExecutionPolicy Bypass -File scripts/strip-local-overrides.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

$count = 0

function Strip-Line {
    param([string]$File, [string]$Pattern, [string]$Desc)
    if (-not (Test-Path $File)) { return }
    $lines = Get-Content $File
    $hits = @($lines | Where-Object { $_ -match $Pattern })
    if ($hits.Count -gt 0) {
        $filtered = $lines | Where-Object { $_ -notmatch $Pattern }
        $filtered | Set-Content $File -Encoding UTF8
        Write-Host "  [OK] $Desc"
        $script:count++
    }
}

Write-Host "=== Stripping redundant local CSS overrides ==="
Write-Host ""

# --- .btn--small ---
Write-Host "--- .btn--small ---"
$files = @(
    "src/routes/runners/[runner_id]/+page.svelte"
    "src/routes/submit-game/+page.svelte"
    "src/routes/news/+page.svelte"
    "src/routes/games/[game_id]/runs/[tier]/[category]/+page.svelte"
    "src/routes/admin/game-updates/+page.svelte"
    "src/routes/admin/users/+page.svelte"
    "src/routes/admin/contributions/+page.svelte"
    "src/routes/admin/runs/+page.svelte"
    "src/routes/profile/theme/+page.svelte"
    "src/routes/profile/create/+page.svelte"
    "src/routes/profile/edit/+page.svelte"
)
foreach ($f in $files) { Strip-Line -File $f -Pattern '^\s+\.btn--small \{ padding:' -Desc "btn--small from $f" }

# --- Compound lines ---
Write-Host ""
Write-Host "--- Compound lines ---"
foreach ($f in @("src/routes/admin/reports/+page.svelte", "src/routes/admin/games/+page.svelte")) {
    Strip-Line -File $f -Pattern '^\s+\.btn:hover.*\.btn--small.*\.btn:disabled' -Desc "compound from $f"
}
Strip-Line -File "src/routes/admin/profiles/+page.svelte" -Pattern '^\s+\.btn:hover.*\.btn--small' -Desc "compound from profiles"

# --- .btn:hover ---
Write-Host ""
Write-Host "--- .btn:hover ---"
$files = @(
    "src/routes/submit-game/+page.svelte"
    "src/routes/news/+page.svelte"
    "src/routes/games/[game_id]/runs/[tier]/[category]/+page.svelte"
    "src/routes/games/[game_id]/rules/+page.svelte"
    "src/routes/support/+page.svelte"
    "src/routes/admin/game-updates/+page.svelte"
    "src/routes/admin/games/[id]/review/+page.svelte"
    "src/routes/admin/users/+page.svelte"
    "src/routes/admin/contributions/+page.svelte"
    "src/routes/admin/runs/+page.svelte"
    "src/routes/profile/status/+page.svelte"
    "src/routes/profile/create/+page.svelte"
    "src/routes/profile/edit/+page.svelte"
)
foreach ($f in $files) { Strip-Line -File $f -Pattern '^\s+\.btn:hover \{ border-color:' -Desc "btn:hover from $f" }

# --- .btn:disabled ---
Write-Host ""
Write-Host "--- .btn:disabled ---"
$files = @(
    "src/routes/submit-game/+page.svelte"
    "src/routes/news/+page.svelte"
    "src/routes/admin/health/+page.svelte"
    "src/routes/admin/game-updates/+page.svelte"
    "src/routes/admin/games/[id]/review/+page.svelte"
    "src/routes/admin/profiles/+page.svelte"
    "src/routes/admin/users/+page.svelte"
    "src/routes/admin/contributions/+page.svelte"
    "src/routes/admin/runs/+page.svelte"
    "src/routes/profile/theme/+page.svelte"
)
foreach ($f in $files) { Strip-Line -File $f -Pattern '^\s+\.btn:disabled \{ opacity:' -Desc "btn:disabled from $f" }

# --- .spinner ---
Write-Host ""
Write-Host "--- .spinner (36px block) ---"
$files = @(
    "src/routes/admin/reports/+page.svelte"
    "src/routes/admin/health/+page.svelte"
    "src/routes/admin/staff-guides/+page.svelte"
    "src/routes/admin/game-updates/+page.svelte"
    "src/routes/admin/financials/+page.svelte"
    "src/routes/admin/games/+page.svelte"
    "src/routes/admin/profiles/+page.svelte"
    "src/routes/admin/users/+page.svelte"
    "src/routes/admin/game-editor/+page.svelte"
    "src/routes/admin/debug/+page.svelte"
    "src/routes/admin/contributions/+page.svelte"
    "src/routes/admin/runs/+page.svelte"
)
foreach ($f in $files) { Strip-Line -File $f -Pattern '^\s+\.spinner \{ width: 36px;' -Desc "spinner from $f" }

# --- @keyframes spin ---
Write-Host ""
Write-Host "--- @keyframes spin ---"
$files = @(
    "src/routes/games/[game_id]/submit/+page.svelte"
    "src/routes/games/[game_id]/suggest/+page.svelte"
    "src/routes/admin/reports/+page.svelte"
    "src/routes/admin/health/+page.svelte"
    "src/routes/admin/staff-guides/+page.svelte"
    "src/routes/admin/game-updates/+page.svelte"
    "src/routes/admin/financials/+page.svelte"
    "src/routes/admin/games/+page.svelte"
    "src/routes/admin/profiles/+page.svelte"
    "src/routes/admin/users/+page.svelte"
    "src/routes/admin/game-editor/+page.svelte"
    "src/routes/admin/debug/+page.svelte"
    "src/routes/admin/contributions/+page.svelte"
    "src/routes/admin/+page.svelte"
    "src/routes/admin/runs/+page.svelte"
    "src/routes/profile/settings/link-callback/+page.svelte"
    "src/routes/profile/create/+page.svelte"
    "src/routes/profile/edit/+page.svelte"
)
foreach ($f in $files) { Strip-Line -File $f -Pattern '^\s+@keyframes spin' -Desc "keyframes spin from $f" }

# --- .center / .center-sm ---
Write-Host ""
Write-Host "--- .center / .center-sm ---"
foreach ($f in @(
    "src/routes/admin/reports/+page.svelte"
    "src/routes/admin/games/+page.svelte"
    "src/routes/admin/profiles/+page.svelte"
    "src/routes/admin/game-editor/+page.svelte"
)) { Strip-Line -File $f -Pattern '^\s+\.center \{.*\.center-sm \{' -Desc "center+center-sm from $f" }

foreach ($f in @(
    "src/routes/admin/health/+page.svelte"
    "src/routes/admin/staff-guides/+page.svelte"
    "src/routes/admin/game-updates/+page.svelte"
    "src/routes/admin/financials/+page.svelte"
    "src/routes/admin/users/+page.svelte"
    "src/routes/admin/debug/+page.svelte"
    "src/routes/admin/contributions/+page.svelte"
    "src/routes/admin/runs/+page.svelte"
    "src/routes/profile/submissions/update/[id]/+page.svelte"
)) { Strip-Line -File $f -Pattern '^\s+\.center \{ text-align: center;' -Desc "center from $f" }

foreach ($f in @(
    "src/routes/admin/game-updates/+page.svelte"
    "src/routes/admin/users/+page.svelte"
    "src/routes/admin/runs/+page.svelte"
)) { Strip-Line -File $f -Pattern '^\s+\.center-sm \{' -Desc "center-sm from $f" }

# --- .spinner--small rename ---
Write-Host ""
Write-Host "--- .spinner--small to .spinner--sm ---"
foreach ($f in @(
    "src/routes/games/[game_id]/submit/+page.svelte"
    "src/routes/games/[game_id]/suggest/+page.svelte"
)) {
    Strip-Line -File $f -Pattern '^\s+\.spinner--small \{' -Desc "spinner--small CSS from $f"
    if (Test-Path $f) {
        $raw = Get-Content $f -Raw
        if ($raw.Contains('spinner--small')) {
            $raw.Replace('spinner--small', 'spinner--sm') | Set-Content $f -Encoding UTF8 -NoNewline
            Write-Host "  [OK] renamed spinner--small to spinner--sm in $f"
        }
    }
}

# --- Summary ---
Write-Host ""
Write-Host "=== Done. $count definitions stripped. ==="
Write-Host ""
Write-Host "MANUAL REVIEW NEEDED (multi-line blocks):"
Write-Host "  1. admin/+page.svelte -- .spinner block"
Write-Host "  2. admin/+layout.svelte -- .admin-loading .spinner block"
Write-Host "  3. profile/create/+page.svelte -- .spinner block"
Write-Host "  4. profile/edit/+page.svelte -- .spinner block"
Write-Host "  5. profile/submissions/+page.svelte -- .btn:hover / .btn:disabled"
Write-Host "  6. support/+page.svelte -- .btn:disabled block"
Write-Host "  7. sign-in/+page.svelte -- .btn:disabled block"
Write-Host ""
Write-Host "Verify with: git diff --stat"
