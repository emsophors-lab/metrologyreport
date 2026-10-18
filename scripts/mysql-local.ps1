<#
    MLRS — the local MySQL database.

    A self-contained MySQL instance for development on this machine. The data
    directory lives OUTSIDE the repository (C:\mlrs-mysql by default) so that
    Vite does not watch it, git does not see it, and deleting the checkout
    does not delete the database.

    Nothing here is installed as a Windows service: the server runs only while
    you have started it, which is what you want on a laptop.

        .\scripts\mysql-local.ps1 init     create the data directory (once)
        .\scripts\mysql-local.ps1 start    start the server
        .\scripts\mysql-local.ps1 status   is it listening, and what is in it
        .\scripts\mysql-local.ps1 load     (re)create the mlrs schema
        .\scripts\mysql-local.ps1 seed     add the demo licensee and accounts
        .\scripts\mysql-local.ps1 shell    open a mysql prompt on it
        .\scripts\mysql-local.ps1 stop     stop the server
        .\scripts\mysql-local.ps1 reset    DROP the database and reload it

    `reset` destroys every row in the mlrs database and asks first.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('init', 'start', 'status', 'load', 'seed', 'shell', 'stop', 'reset')]
    [string]$Command = 'status',

    [string]$BaseDir = 'C:\Program Files\MySQL\MySQL Server 8.4',
    [string]$DataDir = 'C:\mlrs-mysql\data',
    [int]$Port       = 3306
)

$ErrorActionPreference = 'Stop'

$mysqld  = Join-Path $BaseDir 'bin\mysqld.exe'
$mysql   = Join-Path $BaseDir 'bin\mysql.exe'
$logFile = Join-Path (Split-Path $DataDir -Parent) 'mysqld.log'
$sqlDir  = Join-Path $PSScriptRoot '..\mysql'

if (-not (Test-Path $mysqld)) {
    throw "MySQL server not found at $mysqld. Install MySQL 8.0.16+ or pass -BaseDir."
}

function Test-Listening {
    try { Test-NetConnection 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue }
    catch { $false }
}

function Invoke-Sql([string]$File, [string]$Database) {
    $args = @('-u', 'root', '--protocol=TCP', "--port=$Port", '--default-character-set=utf8mb4')
    if ($Database) { $args += $Database }
    Get-Content -Raw -Encoding UTF8 $File | & $mysql @args
    if ($LASTEXITCODE -ne 0) { throw "mysql exited $LASTEXITCODE while running $File" }
    Write-Host "  loaded $(Split-Path $File -Leaf)" -ForegroundColor DarkGray
}

switch ($Command) {

    'init' {
        if (Test-Path (Join-Path $DataDir 'mysql')) {
            Write-Host "Data directory already initialized: $DataDir" -ForegroundColor Yellow
            break
        }
        New-Item -ItemType Directory -Force (Split-Path $DataDir -Parent) | Out-Null
        # --initialize-insecure leaves root with no password. That is fine for a
        # database that listens on this machine only; do not do it on a server.
        & $mysqld --initialize-insecure --basedir="$BaseDir" --datadir="$DataDir" --console
        if ($LASTEXITCODE -ne 0) { throw "mysqld --initialize failed ($LASTEXITCODE)" }
        Write-Host "Initialized $DataDir (root has no password)." -ForegroundColor Green
    }

    'start' {
        if (Test-Listening) { Write-Host "Already listening on $Port." -ForegroundColor Yellow; break }
        if (-not (Test-Path (Join-Path $DataDir 'mysql'))) { throw "Not initialized. Run: .\scripts\mysql-local.ps1 init" }

        Start-Process -FilePath $mysqld -WindowStyle Hidden -ArgumentList @(
            "--basedir=$BaseDir", "--datadir=$DataDir", "--port=$Port",
            "--log-error=$logFile"
        )
        for ($i = 0; $i -lt 30; $i++) { if (Test-Listening) { break }; Start-Sleep -Milliseconds 500 }
        if (Test-Listening) { Write-Host "MySQL is up on 127.0.0.1:$Port" -ForegroundColor Green }
        else { throw "MySQL did not come up. See $logFile" }
    }

    'stop' {
        if (-not (Test-Listening)) { Write-Host "Not running." -ForegroundColor Yellow; break }
        & $mysql -u root --protocol=TCP --port=$Port -e "SHUTDOWN;" 2>$null
        for ($i = 0; $i -lt 20; $i++) { if (-not (Test-Listening)) { break }; Start-Sleep -Milliseconds 500 }
        Write-Host "Stopped." -ForegroundColor Green
    }

    'load' {
        if (-not (Test-Listening)) { throw "MySQL is not running. Run: .\scripts\mysql-local.ps1 start" }
        Invoke-Sql (Join-Path $sqlDir '01_schema.sql')
        Invoke-Sql (Join-Path $sqlDir '02_functions_views.sql')
        Write-Host "Schema loaded into 'mlrs'." -ForegroundColor Green
    }

    'seed' {
        if (-not (Test-Listening)) { throw "MySQL is not running. Run: .\scripts\mysql-local.ps1 start" }
        Invoke-Sql (Join-Path $sqlDir '03_seed.sql')
        Write-Host "Demo data loaded." -ForegroundColor Green
    }

    'reset' {
        if (-not (Test-Listening)) { throw "MySQL is not running. Run: .\scripts\mysql-local.ps1 start" }
        Write-Host "This DROPS the 'mlrs' database. Every row in it is lost." -ForegroundColor Red
        $answer = Read-Host "Type the word 'drop' to continue"
        if ($answer -ne 'drop') { Write-Host "Cancelled. Nothing changed." -ForegroundColor Yellow; break }
        & $mysql -u root --protocol=TCP --port=$Port -e "DROP DATABASE IF EXISTS mlrs;"
        Invoke-Sql (Join-Path $sqlDir '01_schema.sql')
        Invoke-Sql (Join-Path $sqlDir '02_functions_views.sql')
        Write-Host "Reset." -ForegroundColor Green
    }

    'shell' {
        & $mysql -u root --protocol=TCP --port=$Port --default-character-set=utf8mb4 mlrs
    }

    'status' {
        if (-not (Test-Listening)) {
            Write-Host "MySQL is NOT running on 127.0.0.1:$Port" -ForegroundColor Yellow
            Write-Host "  data directory: $DataDir  (initialized: $(Test-Path (Join-Path $DataDir 'mysql')))"
            break
        }
        Write-Host "MySQL is running on 127.0.0.1:$Port" -ForegroundColor Green
        & $mysql -u root --protocol=TCP --port=$Port --default-character-set=utf8mb4 --table -e @"
SELECT VERSION() AS version, @@character_set_database AS charset, @@time_zone AS tz;
SELECT COUNT(*) AS tables_in_mlrs FROM information_schema.tables
 WHERE table_schema='mlrs' AND table_type='BASE TABLE';
SELECT table_name, table_rows FROM information_schema.tables
 WHERE table_schema='mlrs' AND table_type='BASE TABLE' AND table_rows > 0
 ORDER BY table_rows DESC;
"@
    }
}
