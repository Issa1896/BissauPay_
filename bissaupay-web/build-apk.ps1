param(
  [string]$ApiUrl = "http://10.0.2.2:3000/api/v1"
)

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sdkDir = "$env:USERPROFILE\Android\Sdk"
$toolsDir = "$sdkDir\cmdline-tools\latest"

Write-Host "=== BissauPay APK Builder ===" -ForegroundColor Cyan

# 1. Verificar/instalar Android SDK
if (-not (Test-Path "$sdkDir\platforms\android-34")) {
  Write-Host "[1/5] Android SDK não encontrado. Descarregando..." -ForegroundColor Yellow

  if (-not (Test-Path "$toolsDir\bin\sdkmanager.bat")) {
    $zipUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"
    $zipPath = "$env:TEMP\cmdline-tools.zip"

    if (-not (Test-Path $zipPath)) {
      Write-Host "  A descarregar Android cmdline-tools..." -ForegroundColor Gray
      Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    }

    Remove-Item "$sdkDir\cmdline-tools" -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive -Path $zipPath -DestinationPath "$sdkDir\cmdline-tools" -Force
    Move-Item "$sdkDir\cmdline-tools\cmdline-tools" "$toolsDir" -ErrorAction SilentlyContinue
    if (Test-Path "$sdkDir\cmdline-tools\cmdline-tools") {
      Move-Item "$sdkDir\cmdline-tools\cmdline-tools\*" "$toolsDir" -Force
      Remove-Item "$sdkDir\cmdline-tools\cmdline-tools" -Recurse -Force
    }
  }

  Write-Host "  A instalar platform SDK 34 + build-tools..." -ForegroundColor Gray
  & "$toolsDir\bin\sdkmanager.bat" "platforms;android-34" "build-tools;34.0.0" --sdk_root=$sdkDir | Out-Null
} else {
  Write-Host "[1/5] Android SDK encontrado" -ForegroundColor Green
}

# 2. Definir local.properties
Write-Host "[2/5] A configurar local.properties" -ForegroundColor Cyan
@"
sdk.dir=$($sdkDir -replace '\\', '\\')
"@ | Set-Content "$rootDir\android\local.properties" -Force

# 3. Instalar dependências npm
Write-Host "[3/5] A instalar dependências npm" -ForegroundColor Cyan
Set-Location $rootDir
npm install

# 4. Build web app
Write-Host "[4/5] A compilar web app (API: $ApiUrl)" -ForegroundColor Cyan
$env:VITE_API_URL = $ApiUrl
npm run build

# 5. Sync + Build APK
Write-Host "[5/5] A sincronizar Capacitor e compilar APK" -ForegroundColor Cyan
npx cap sync android
Set-Location "$rootDir\android"
& "$rootDir\android\gradlew.bat" assembleDebug

$apkPath = "$rootDir\android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
  $size = (Get-Item $apkPath).Length / 1MB
  Write-Host "`nAPK gerado com sucesso!" -ForegroundColor Green
  Write-Host "Localização: $apkPath" -ForegroundColor Green
  Write-Host "Tamanho: $( [math]::Round($size, 1) ) MB" -ForegroundColor Green
} else {
  Write-Host "Erro: APK não foi gerado" -ForegroundColor Red
  exit 1
}
