$start_dir = $PSScriptRoot

Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

#python -m analytics.all #--all_players 'True' --injuries "Y" #for late night runs
#python -m analytics.all --all_players "True" --program 2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025
#python -c "from utilities import injuries_and_depth; injuries_and_depth.main()"
#python -m utilities.team_assignment
#python -m dashboard.dashboard_matchups --min_pa 50 --min_ip 15 --rosters
python -m dashboard.visualization --module Current --year 2026 #generate then publish

#Set-Location $start_dir
Set-Location 'C:\Users\kcamp\Downloads\MLB_Dashboard'

git add .
git commit -m 'update'
git push --force

#Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

#python -m analytics.all --all_players "True" --program 2024,2025

#python -m analytics.all --all_players "True" --injuries "Y"