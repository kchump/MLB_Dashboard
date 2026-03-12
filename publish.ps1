$start_dir = $PSScriptRoot

Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

#python -m analytics.all --all_players 'True' --modules Relievers #for late night runs
python -m analytics.all --all_players "True" --program 2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025
python -m dashboard.visualization --module Current --year 2026 #generate then publish

Set-Location $start_dir

git add .
git commit -m 'update'
git push

Set-Location 'C:\Users\kcamp\Downloads\baseball\src'