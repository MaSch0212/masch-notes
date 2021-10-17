SELECT [e].[name]
     , [c].[name] AS [category]
     , [e].[date]
     , [e].[content]
FROM [notebookentries] [e]
LEFT JOIN [notebookcategories] [c]
    ON [e].[categoryid] = [c].[id] AND [e].[notebookid] = [c].[notebookid]
WHERE [e].[id] = @entryid
