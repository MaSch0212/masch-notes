DELETE FROM [notebookcategories]
WHERE [id] IN (
    SELECT DISTINCT [c].[id]
    FROM [notebookcategories] [c]
    LEFT JOIN [notebookentries] [e] ON [c].[id] = [e].[categoryid]
    WHERE [e].[id] IS NULL
)
