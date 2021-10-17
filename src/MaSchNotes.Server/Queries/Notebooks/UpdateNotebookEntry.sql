INSERT OR IGNORE
    INTO [notebookcategories] ([notebookid], [name])
    VALUES (
        (SELECT [notebookid]
         FROM [notebookentries]
         WHERE [id] = @entryid),
        @category);

UPDATE [notebookentries]
SET [name] = @name
  , [categoryid] = (SELECT [id]
                    FROM [notebookcategories]
                    WHERE [notebookid] = (SELECT [notebookid]
                                          FROM [notebookentries]
                                          WHERE [id] = @entryid)
                      AND [name] = @category)
  , [date] = @date
  , [content] = @content
WHERE [id] = @entryid
