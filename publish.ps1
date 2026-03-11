$start_dir = $PSScriptRoot

Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

python -m analytics.all --all_players 'True' --modules Relievers #for late night runs
python -m dashboard.visualization --module Current --year 2026 #generate then publish

Set-Location $start_dir

git add .
git commit -m 'update'
git push