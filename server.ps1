# Servidor HTTP Estático em PowerShell para o Sistema de Vendas
# Permite rodar a SPA com suporte a ES Modules (CORS local) sem dependências externas (Node/Python)
# Autor: Antigravity

$port = 8000
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
    $listener.Start()
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Servidor do Sistema de Vendas Iniciado!" -ForegroundColor Green
    Write-Host "  Acesse: http://localhost:$port/" -ForegroundColor Yellow
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "Pressione Ctrl+C no console para parar o servidor.`n" -ForegroundColor Gray

    $currentDir = Get-Location

    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        # Determina o arquivo local solicitado
        $localPath = $request.Url.LocalPath
        if ($localPath -eq "/") {
            $localPath = "/index.html"
        }

        # Constrói o caminho completo e substitui barras
        $filePath = Join-Path $currentDir $localPath
        $filePath = $filePath.Replace("/", "\")

        # Verifica se o arquivo existe e serve
        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            
            # Define o tipo MIME correto baseado na extensão
            $extension = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mimeType = "application/octet-stream"
            
            switch ($extension) {
                ".html" { $mimeType = "text/html; charset=utf-8" }
                ".css"  { $mimeType = "text/css; charset=utf-8" }
                ".js"   { $mimeType = "text/javascript; charset=utf-8" }
                ".json" { $mimeType = "application/json; charset=utf-8" }
                ".png"  { $mimeType = "image/png" }
                ".jpg"  { $mimeType = "image/jpeg" }
                ".jpeg" { $mimeType = "image/jpeg" }
                ".ico"  { $mimeType = "image/x-icon" }
                ".svg"  { $mimeType = "image/svg+xml" }
            }

            $response.ContentType = $mimeType
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            # Arquivo não encontrado (404)
            $response.StatusCode = 404
            $errorMsg = [System.Text.Encoding]::UTF8.GetBytes("404 - Arquivo nao encontrado")
            $response.ContentType = "text/plain; charset=utf-8"
            $response.ContentLength64 = $errorMsg.Length
            $response.OutputStream.Write($errorMsg, 0, $errorMsg.Length)
        }

        $response.Close()
    }
}
catch {
    Write-Host "Erro ao iniciar o servidor: $_" -ForegroundColor Red
}
finally {
    $listener.Stop()
}
