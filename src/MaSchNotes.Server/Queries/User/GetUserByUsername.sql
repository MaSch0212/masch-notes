SELECT [u].[id]
     , [u].[givenname]
     , [u].[surname]
     , [u].[email]
FROM [accounts] AS [a]
JOIN [users] AS [u] ON [a].[userid] = [u].[id]
WHERE [a].[name] = @username COLLATE NOCASE
