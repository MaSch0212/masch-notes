if ($null -eq (Resolve-DnsName marc-nas -DnsOnly -ErrorAction Ignore)) {
    $registry = "docker.masch212.de"
}
else {
    $registry = "marc-nas:4000"
}

Write-Host "Using docker registry $registry"
return $registry