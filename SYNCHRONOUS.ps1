$ErrorActionPreference = 'Stop'

try {
    Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

    python -c "from utilities import injuries_and_depth; injuries_and_depth.main()" #update rosters/injuries
    python -m utilities.speed_defense_prospects --module Prospects --year 2026
    python -m utilities.speed_defense_prospects --module Defense
    python -m utilities.savant_tables --year 2026 #grab savant data

    $src_dir = 'C:\Users\kcamp\Downloads\baseball\src'
    $run_dir = Join-Path $src_dir 'run_logs'
    New-Item -ItemType Directory -Force -Path $run_dir | Out-Null

    $jobs = @(
        @{ name = 'Starters'; cmd = 'python -m analytics.all --modules Starters' },
        @{ name = 'Hitters'; cmd = 'python -m analytics.all --modules Hitters' },
        @{ name = 'Relievers'; cmd = 'python -m analytics.all --modules Relievers' }
    )

    #$procs = @()
    #$procs += Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$src_dir'; python -m analytics.all --modules Starters; if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'Starters failed' -ForegroundColor Red }" -PassThru
    #$procs += Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$src_dir'; python -m analytics.all --modules Hitters; if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'Hitters failed' -ForegroundColor Red }" -PassThru
    #$procs += Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$src_dir'; python -m analytics.all --modules Relievers; if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'Relievers failed' -ForegroundColor Red }" -PassThru
    #$procs += Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$src_dir'; python -m analytics.all --modules Starters; if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'Starters failed' -ForegroundColor Red; Read-Host 'Press Enter to close' }" -PassThru
    #$procs += Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$src_dir'; python -m analytics.all --modules Hitters; if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'Hitters failed' -ForegroundColor Red; Read-Host 'Press Enter to close' }" -PassThru
    #$procs += Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$src_dir'; python -m analytics.all --modules Relievers; if (`$LASTEXITCODE -ne 0) { Write-Host ''; Write-Host 'Relievers failed' -ForegroundColor Red; Read-Host 'Press Enter to close' }" -PassThru

     foreach ($job in $jobs) {
        $log_path = Join-Path $run_dir ($job.name + '.log')
        $done_path = Join-Path $run_dir ($job.name + '.done')

        if (Test-Path $log_path) { Remove-Item $log_path -Force }
        if (Test-Path $done_path) { Remove-Item $done_path -Force }

        $child_script = @"
Set-Location '$src_dir'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new(`$false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(`$false)
chcp 65001 > `$null
`$env:PYTHONIOENCODING = 'utf-8'

if (`$null -ne (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)) {
    `$PSNativeCommandUseErrorActionPreference = `$false
}

`$ErrorActionPreference = 'Continue'

try {
    & cmd.exe /c "$($job.cmd) 2>&1" | Tee-Object -FilePath '$log_path'
    `$exit_code = `$LASTEXITCODE
}
catch {
    `$_ | Out-String | Tee-Object -FilePath '$log_path' -Append
    `$exit_code = 1
}

Set-Content -Path '$done_path' -Value `$exit_code

Write-Host ''
if (`$exit_code -ne 0) {
    Write-Host '$($job.name) failed' -ForegroundColor Red
}
else {
    Write-Host '$($job.name) finished' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Log: $log_path'
Write-Host 'Done file: $done_path'
Write-Host ''
Write-Host 'Window left open on purpose.'
"@

        Start-Process powershell.exe -ArgumentList '-NoExit', '-Command', $child_script | Out-Null
    }

    $remaining_jobs = @($jobs.name)

    while ($remaining_jobs.Count -gt 0) {
        foreach ($job_name in @($remaining_jobs)) {
            $done_path = Join-Path $run_dir ($job_name + '.done')

            if (Test-Path $done_path) {
                $exit_code = [int](Get-Content $done_path | Select-Object -First 1)

                if ($exit_code -ne 0) {
                    throw "$job_name failed. See $(Join-Path $run_dir ($job_name + '.log'))"
                }

                $remaining_jobs = @($remaining_jobs | Where-Object { $_ -ne $job_name })
            }
        }

        if ($remaining_jobs.Count -gt 0) {
            Start-Sleep -Seconds 2
        }
    }
    python -m utilities.team_assignment

    #Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

    #python -m analytics.all #--all_players 'True' --injuries "Y" #for late night runs
    #python -m analytics.all --program 2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025
    #python -m dashboard.dashboard_matchups --min_pa 50 --min_ip 15 --rosters --rosters_year 2025
    python -m dashboard.dashboard_matchups --min_pa 50 --min_ip 15 --rosters
    python -m dashboard.visualization --module Current --year 2026 #generate then publish

    #Set-Location $start_dir
    Set-Location 'C:\Users\kcamp\Downloads\MLB_Dashboard'

    git add .
    git commit -m 'update'
    git push --force
}
catch {
    Write-Host ''
    Write-Host 'ERROR:' -ForegroundColor Red
    Write-Host $_
}
finally {
    Write-Host ''
}