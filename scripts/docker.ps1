param(
    [switch]$Push
)

Set-Location "$PSScriptRoot\.."

if ($null -eq (Resolve-DnsName marc-nas -DnsOnly -ErrorAction Ignore)) {
    $registry = "docker.masch212.de"
}
else {
    $registry = "marc-nas:4000"
}
Write-Host "Using docker registry $registry"

$tag = "$registry/masch-notes:latest"

if ($Push) {
    docker buildx build --platform linux/amd64,linux/arm64 -t $tag --push .
}
else {
    docker buildx build --load -t $tag .
}

exit $LASTEXITCODE
