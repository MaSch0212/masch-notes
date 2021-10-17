INSERT OR IGNORE
    INTO [notebookcategories] ([notebookid], [name])
    VALUES (@notebookid, @category);

INSERT INTO [notebookentries] ([notebookid], [name], [categoryid], [date], [content])
    VALUES (
        @notebookid,
        @name,
        (SELECT [id]
         FROM [notebookcategories]
         WHERE [notebookid] = @notebookid AND [name] = @category),
        @date,
        @content);
SELECT last_insert_rowid();
