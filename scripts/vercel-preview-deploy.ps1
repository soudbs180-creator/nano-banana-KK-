param(
    [string]$ProjectPath = ".",
    [string]$Framework = "vite"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

$resolvedProjectPath = (Resolve-Path $ProjectPath).Path
$tempDir = Join-Path $env:TEMP ("kk-studio-vercel-" + [guid]::NewGuid().ToString())
$tarball = Join-Path $tempDir "project.tgz"
$endpoint = "https://codex-deploy-skills.vercel.sh/api/deploy"

$fileStream = $null
$client = $null

try {
    New-Item -ItemType Directory -Path $tempDir | Out-Null

    tar.exe `
        --exclude=node_modules `
        --exclude=.git `
        --exclude=.env `
        --exclude=.env.* `
        --exclude=dist `
        --exclude=build `
        --exclude=coverage `
        -czf $tarball `
        -C $resolvedProjectPath .

    if (!(Test-Path $tarball)) {
        throw "Tarball was not created."
    }

    $client = New-Object System.Net.Http.HttpClient
    $content = New-Object System.Net.Http.MultipartFormDataContent

    $fileStream = [System.IO.File]::OpenRead($tarball)
    $fileContent = New-Object System.Net.Http.StreamContent($fileStream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/gzip")

    $content.Add($fileContent, "file", "project.tgz")
    $content.Add((New-Object System.Net.Http.StringContent($Framework)), "framework")

    $response = $client.PostAsync($endpoint, $content).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
        throw "Deploy request failed: $($response.StatusCode) $body"
    }

    $json = $body | ConvertFrom-Json
    $json | ConvertTo-Json -Depth 10
}
finally {
    if ($fileStream) {
        $fileStream.Dispose()
    }
    if ($client) {
        $client.Dispose()
    }
    if (Test-Path $tempDir) {
        Remove-Item -Recurse -Force $tempDir
    }
}
