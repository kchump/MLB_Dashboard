if ($Host.Name -ne 'ConsoleHost') {
    Start-Process powershell.exe -ArgumentList @(
        '-NoExit',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSCommandPath`""
    )
    exit
}

Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

$programs = 2015..2025
$modules = @('Starters','Hitters', 'Relievers') # 'Hitters'
$max_concurrent = 10

$log_file = Join-Path $PSScriptRoot 'run_log.txt'
$job_log_dir = Join-Path $PSScriptRoot 'job_logs'

New-Item -ItemType Directory -Force -Path $job_log_dir | Out-Null
Remove-Item $log_file -ErrorAction SilentlyContinue
# Remove-Item (Join-Path $job_log_dir '*') -ErrorAction SilentlyContinue

$tasks = foreach ($program in $programs) {
    foreach ($module in $modules) {
        $base_name = "$program-$module"
        [pscustomobject]@{
            program = $program
            module = $module
            name = $base_name
            transcript_log = Join-Path $job_log_dir "$base_name.log"
        }
    }
}

$task_index = 0
$running_procs = @()
$failed_tasks = @()
$completed_count = 0
$total_count = $tasks.Count
$last_running_summary = ''

while ($task_index -lt $tasks.Count -or $running_procs.Count -gt 0) {
    while ($running_procs.Count -lt $max_concurrent -and $task_index -lt $tasks.Count) {
        $task = $tasks[$task_index]

        if (Test-Path $task.transcript_log) {
            Remove-Item $task.transcript_log -Force
        }

        $command = @"
Set-Location '$((Get-Location).Path)'

`$transcript_log = '$($task.transcript_log)'

[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(`$false)
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new(`$false)
`$OutputEncoding = [System.Text.UTF8Encoding]::new(`$false)
`$env:PYTHONIOENCODING = 'utf-8'
`$env:PYTHONUTF8 = '1'

try {
    chcp 65001 > `$null
} catch {}

Start-Transcript -Path `$transcript_log -Force | Out-Null

Write-Host ''
Write-Host '==================================='
Write-Host 'STARTING $($task.module) $($task.program)'
Write-Host '==================================='
Write-Host ''

python -X utf8 -m analytics.all --program $($task.program) --all_players "True" --modules $($task.module)

`$exit_code = `$LASTEXITCODE

Write-Host ''
Write-Host '==================================='
Write-Host 'FINISHED $($task.module) $($task.program) exit_code='`$exit_code
Write-Host '==================================='
Write-Host ''

Stop-Transcript | Out-Null

exit `$exit_code
"@

        try {
            $proc = Start-Process powershell.exe -ArgumentList @(
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-Command', $command
            ) -PassThru

            $running_procs += [pscustomobject]@{
                name = $task.name
                program = $task.program
                module = $task.module
                transcript_log = $task.transcript_log
                process = $proc
            }

            Write-Host "STARTED $($task.name) pid=$($proc.Id) active=$($running_procs.Count)/$max_concurrent queued=$($total_count - $task_index - 1)"
        }
        catch {
            Write-Host "FAILED TO START $($task.name)" -ForegroundColor Yellow

            $failed_tasks += [pscustomobject]@{
                name = $task.name
                program = $task.program
                module = $task.module
                exit_code = 'start_failed'
                tail = $_.Exception.Message
            }
        }

        $task_index += 1
    }

    if ($running_procs.Count -gt 0) {
        Start-Sleep -Milliseconds 1000

        $still_running = @()

        foreach ($entry in $running_procs) {
            $entry.process.Refresh()

            if ($entry.process.HasExited) {
                $exit_code = $entry.process.ExitCode
                $completed_count += 1

                Add-Content -Path $log_file -Value "$($entry.module) $($entry.program)"
                Add-Content -Path $log_file -Value ''

                if (Test-Path $entry.transcript_log) {
                    Get-Content $entry.transcript_log | Add-Content -Path $log_file
                }
                else {
                    Add-Content -Path $log_file -Value '[no transcript log found]'
                }

                Add-Content -Path $log_file -Value ''
                Add-Content -Path $log_file -Value '==================================='
                Add-Content -Path $log_file -Value ''

                if ($exit_code -ne 0) {
                    $tail = @()
                    if (Test-Path $entry.transcript_log) {
                        $tail = Get-Content $entry.transcript_log -Tail 40
                    }

                    Write-Host "DONE   $($entry.name) FAILED exit_code=$exit_code completed=$completed_count/$total_count remaining=$($total_count - $completed_count)" -ForegroundColor Yellow

                    $failed_tasks += [pscustomobject]@{
                        name = $entry.name
                        program = $entry.program
                        module = $entry.module
                        exit_code = $exit_code
                        tail = ($tail -join [Environment]::NewLine)
                    }
                }
                else {
                    Write-Host "DONE   $($entry.name) exit_code=0 completed=$completed_count/$total_count remaining=$($total_count - $completed_count)"
                }
            }
            else {
                $still_running += $entry
            }
        }

        $active_names = ($still_running | ForEach-Object { $_.name }) -join ', '

        if ($still_running.Count -gt 0 -and $active_names -ne $last_running_summary) {
            Write-Host "RUNNING $($still_running.Count) active: $active_names"
            $last_running_summary = $active_names
        }

        if ($still_running.Count -eq 0) {
            $last_running_summary = ''
        }

        $running_procs = $still_running
    }
}

Write-Host ''
Write-Host 'All jobs finished.'

if ($failed_tasks.Count -gt 0) {
    Write-Host ''
    Write-Host 'Failed tasks:' -ForegroundColor Yellow

    foreach ($failed in $failed_tasks) {
        Write-Host ''
        Write-Host "  $($failed.name) exit_code=$($failed.exit_code)" -ForegroundColor Yellow
        if ($failed.tail) {
            Write-Host '  Last output:'
            Write-Host $failed.tail
        }
    }

    Add-Content -Path $log_file -Value 'FAILED TASK SUMMARY'
    Add-Content -Path $log_file -Value '==================='
    Add-Content -Path $log_file -Value ''

    foreach ($failed in $failed_tasks) {
        Add-Content -Path $log_file -Value "$($failed.name) exit_code=$($failed.exit_code)"
        if ($failed.tail) {
            Add-Content -Path $log_file -Value $failed.tail
        }
        Add-Content -Path $log_file -Value ''
    }
}
else {
    Write-Host 'No failed tasks.'
}

Write-Host ''
Write-Host "Combined log file: $log_file"
Write-Host "Per-job logs: $job_log_dir"
Write-Host ''
Write-Host 'Press any key to exit...'
$null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
###########################################################
Set-Location 'C:\Users\kcamp\Downloads\baseball\src'

python -m utilities.team_assignment 2015-2025
#python -m dashboard.dashboard_matchups --min_pa 10 --min_ip 5
#python -m dashboard.visualization --module Current --year 2026 #generate then publish

Set-Location 'C:\Users\kcamp\Downloads\MLB_Dashboard'

#git add .
#git commit -m 'update'
#git push