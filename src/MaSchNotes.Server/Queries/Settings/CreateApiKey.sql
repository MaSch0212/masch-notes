INSERT INTO [apikeys] ([key], [name], [userid], [timestamp])
    VALUES (@key, @name, @userid, @timestamp);
SELECT last_insert_rowid();
