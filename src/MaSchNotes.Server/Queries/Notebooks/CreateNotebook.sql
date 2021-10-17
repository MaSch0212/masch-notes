INSERT INTO [notebooks] ([userId], [name], [isdiary])
    VALUES (@userid, @name, @isdiary);
SELECT last_insert_rowid();
