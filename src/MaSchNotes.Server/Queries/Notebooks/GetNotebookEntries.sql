SELECT [e].[id]
     , [e].[name]
     , [c].[name] AS [category]
     , [e].[date]
     , CASE @includecontent
           WHEN 1 THEN [e].[content]
           ELSE NULL
       END AS [content]
FROM [notebookentries] [e]
LEFT JOIN [notebookcategories] [c]
    ON [e].[categoryid] = [c].[id] AND [e].[notebookid] = [c].[notebookid]
WHERE [e].[notebookid] = @notebookid
