# Script de Implantação Automatizada no Firebase Hosting (Google)
# Autor: Antigravity

$cliName = "firebase.exe"
$cliUrl = "https://firebase.tools/bin/win/instant/latest"

# 1. Garante que a CLI do Firebase existe localmente
$cliPath = Join-Path $PSScriptRoot $cliName
if (-not (Test-Path $cliPath)) {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Baixando a ferramenta de implantação do Firebase..." -ForegroundColor Yellow
    Write-Host "  Isso é feito uma única vez e pode levar alguns segundos..." -ForegroundColor Gray
    Write-Host "==========================================================" -ForegroundColor Cyan
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $cliUrl -OutFile $cliPath -UserAgent "Mozilla/5.0"
        Write-Host "Download concluído com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host "Erro ao baixar a ferramenta do Firebase: $_" -ForegroundColor Red
        Write-Host "Por favor, tente rodar o script novamente." -ForegroundColor Yellow
        exit
    }
}

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "             IMPLANTAÇÃO NO GOOGLE FIREBASE" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 2. Identifica o ID do projeto configurado
$projectId = "sistema-de-vendas-71c23"
Write-Host "Projeto vinculado detectado: $projectId" -ForegroundColor Green

# 3. Autenticação no Google Firebase
Write-Host "`n[Passo 1/2] Fazendo login na sua conta Google..." -ForegroundColor Yellow
Write-Host "Seu navegador será aberto para autorizar a ferramenta do Firebase CLI.`n" -ForegroundColor Gray
Start-Sleep -Seconds 2

& $cliPath login

# 4. Deploy da Aplicação
Write-Host "`n[Passo 2/2] Enviando os arquivos para os servidores do Google..." -ForegroundColor Yellow
Write-Host "Isso criará seu link público seguro com HTTPS.`n" -ForegroundColor Gray
Start-Sleep -Seconds 1

& $cliPath deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host "  Parabéns! Site implantado com sucesso no Google Firebase!" -ForegroundColor Green
    Write-Host "  Qualquer pessoa no mundo poderá acessar o seu site!" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
} else {
    Write-Host "`n==========================================================" -ForegroundColor Red
    Write-Host "  Ocorreu um erro durante a implantação." -ForegroundColor Red
    Write-Host "  Verifique se você está logado na conta correta do Google." -ForegroundColor Red
    Write-Host "==========================================================" -ForegroundColor Red
}
