SELECT [name], [password]
FROM [accounts]
WHERE [userid] = @userid
LIMIT 1
