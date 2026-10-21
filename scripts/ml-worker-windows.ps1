[CmdletBinding()]
param([ValidateSet('run', 'check', 'install', 'status', 'stop', 'uninstall')][string]$Command = 'status',
    [ValidateSet('local', 'production')][string]$Profile = 'local')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$taskName = 'MLRS-Local-ML-Worker'
if ($Profile -eq 'production') { $taskName = 'MLRS-Production-ML-Worker' }
trap {
    if ($Profile -eq 'production') {
        $message = "$(Get-Date -Format o) Worker launcher failed: $($_.Exception.Message)"
        Add-Content -LiteralPath (Join-Path $env:LOCALAPPDATA 'MLRS/production-ml/launcher.log') -Value $message
    }
    throw $_
}
$node = (Get-Command node -ErrorAction Stop).Source

function Invoke-ProductionWorker([switch]$Check) {
    $profileDir = Join-Path $env:LOCALAPPDATA 'MLRS/production-ml'
    $secret = Import-Clixml -LiteralPath (Join-Path $profileDir 'credential.xml')
    $credential = [System.Net.NetworkCredential]::new('', $secret)
    $previous = $env:SUPABASE_SERVICE_ROLE_KEY
    try {
        $env:SUPABASE_SERVICE_ROLE_KEY = $credential.Password
        if ($Check) { & $node --import tsx scripts/ml-production-worker.ts --status }
        else { & $node --import tsx scripts/ml-production-worker.ts *>> (Join-Path $profileDir 'worker.log') }
        return $LASTEXITCODE
    } finally { $env:SUPABASE_SERVICE_ROLE_KEY = $previous; $credential = $null; $secret = $null }
}

switch ($Command) {
    'run' {
        Set-Location -LiteralPath $root
        if ($Profile -eq 'production') { $code = Invoke-ProductionWorker; exit $code }
        $entry = 'src/ml/worker.ts'
        $log = Join-Path $root 'var/ml-worker.log'
        if ($Profile -eq 'production') {
            $entry = 'scripts/ml-production-worker.ts'
            $log = Join-Path $env:LOCALAPPDATA 'MLRS/production-ml/worker.log'
        }
        New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
        & $node --import tsx $entry *>> $log
        exit $LASTEXITCODE
    }
    'check' {
        Set-Location -LiteralPath $root
        if ($Profile -eq 'production') { Invoke-ProductionWorker -Check | Write-Output }
        else { & $node --import tsx scripts/ml-local-setup.ts }
    }
    'install' {
        if (-not (Test-Path (Join-Path $root '.venv-ml/Scripts/python.exe'))) {
            throw 'Create .venv-ml and install ml/requirements.txt first.'
        }
        if ($Profile -eq 'production' -and -not (Test-Path (Join-Path $env:LOCALAPPDATA 'MLRS/production-ml/worker.env'))) {
            throw 'Configure the private production worker profile first.'
        }
        if ($Profile -eq 'production' -and -not (Test-Path (Join-Path $env:LOCALAPPDATA 'MLRS/production-ml/credential.xml'))) {
            throw 'Configure the Windows-encrypted production credential first.'
        }
        if ($Profile -eq 'production') {
            $shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'MLRS Production Retraining.lnk'
            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut($shortcutPath)
            $shortcut.TargetPath = $node
            $shortcut.Arguments = '"' + (Join-Path $root 'scripts/ml-production-supervisor.cjs') + '"'
            $shortcut.WorkingDirectory = $root
            $shortcut.WindowStyle = 7
            $shortcut.Description = 'MLRS production retraining; runs while this user is signed in.'
            $shortcut.Save()
            Start-Process -FilePath $node -ArgumentList 'scripts/ml-production-supervisor.cjs' `
                -WorkingDirectory $root -WindowStyle Hidden | Out-Null
            Write-Host 'Production supervisor installed in user login startup. No paid host or password is required.'
            return
        }
        $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        $powershell = (Get-Process -Id $PID).Path
        $action = New-ScheduledTaskAction -Execute $powershell -WorkingDirectory $root -Argument (
            '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $PSCommandPath + '" run -Profile ' + $Profile)
        $trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
        $principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
        $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) `
            -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
        Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
            -Principal $principal -Settings $settings -Force | Out-Null
        Start-ScheduledTask -TaskName $taskName
        Write-Host "$Profile worker installed for this user at login, with restart-on-failure. The computer must remain awake."
    }
    'status' {
        if ($Profile -eq 'production') {
            Write-Output ('Login startup registered: ' + (Test-Path (Join-Path ([Environment]::GetFolderPath('Startup')) 'MLRS Production Retraining.lnk')))
            Get-CimInstance Win32_Process | Where-Object {
                $_.Name -eq 'node.exe' -and $_.CommandLine -match 'scripts[/\\]ml-production-(supervisor|worker)'
            } | Select-Object ProcessId, ParentProcessId, CommandLine | Format-List
            return
        }
        Get-ScheduledTask -TaskName $taskName | Select-Object TaskName, State | Format-List
        Get-ScheduledTaskInfo -TaskName $taskName | Select-Object LastRunTime, LastTaskResult, NextRunTime | Format-List
    }
    'stop' {
        if ($Profile -eq 'production') {
            $processes = Get-CimInstance Win32_Process | Where-Object {
                $_.Name -eq 'node.exe' -and $_.CommandLine -match 'scripts[/\\]ml-production-supervisor.cjs'
            }
            foreach ($supervisor in $processes) {
                $children = Get-CimInstance Win32_Process | Where-Object {
                    $_.ParentProcessId -eq $supervisor.ProcessId -and $_.CommandLine -match 'ml-production-worker.ts'
                }
                Stop-Process -Id $supervisor.ProcessId
                foreach ($child in $children) { Stop-Process -Id $child.ProcessId -ErrorAction SilentlyContinue }
            }
            return
        }
        Stop-ScheduledTask -TaskName $taskName
    }
    'uninstall' {
        if ($Profile -eq 'production') {
            & $PSCommandPath stop -Profile production
            $shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'MLRS Production Retraining.lnk'
            Remove-Item -LiteralPath $shortcutPath -ErrorAction SilentlyContinue
            Write-Host 'Production startup removed; credential and model artifacts retained. Revoke mlrs_desktop_retraining in Supabase to remove its access.'
            return
        }
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
        Write-Host 'Worker task removed; database and model artifacts retained.'
    }
}
