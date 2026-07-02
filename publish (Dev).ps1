Set-Location $PSScriptRoot

#$start_dir = $PSScriptRoot

#Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

#python -m analytics.all --all_players 'True' --modules Relievers #for late night runs
#python -m analytics.all --all_players "True" --program 2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025
#python -m dashboard.dashboard_matchups --min_pa 50 --min_ip 15 --rosters
python -m dashboard.visualization --module Current --year 2026 #generate then publish

#Set-Location $start_dir

# --- mirror docs incrementally (only changes) ---
$source_docs = 'C:\Users\kcamp\Downloads\MLB_Dashboard\docs'
$target_docs = Join-Path $PSScriptRoot 'docs'

if (!(Test-Path $target_docs)) {
    New-Item -ItemType Directory -Path $target_docs | Out-Null
}

# /MIR mirrors (copy + delete extras)
# /MT uses multithreading (adjust threads if you want)
# /R and /W keep retries from stalling forever
robocopy "$source_docs" "$target_docs" /MIR /MT:16 /R:2 /W:1 /NFL /NDL /NP /XF CNAME.txt

# robocopy returns "weird" success codes; treat < 8 as success
if ($LASTEXITCODE -ge 8) { throw "Robocopy failed with exit code $LASTEXITCODE" }

git add .
git commit -m "update"
git push