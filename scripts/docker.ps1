param(
    [switch]$Push,
    # Registry to tag (and push) the image for, e.g. "registry.example.com". Defaults to $env:DOCKER_REGISTRY.
    [string]$Registry = $env:DOCKER_REGISTRY
)

Set-Location "$PSScriptRoot\.."

if ([string]::IsNullOrWhiteSpace($Registry)) {
    if ($Push) {
        Write-Error "No registry configured. Pass -Registry or set DOCKER_REGISTRY."
        exit 1
    }
    $tag = "masch-notes:latest"
}
else {
    $tag = "$($Registry.TrimEnd('/'))/masch-notes:latest"
}
Write-Host "Building $tag"

if ($Push) {
    docker buildx build --platform linux/amd64,linux/arm64 -t $tag --push .
}
else {
    docker buildx build --load -t $tag .
}

exit $LASTEXITCODE
