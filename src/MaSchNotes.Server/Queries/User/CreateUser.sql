INSERT INTO [users] ([givenname], [surname], [email])
    VALUES (@givenname, @surname, @email);

INSERT INTO [accounts] ([name], [password], [userid])
	VALUES (@username, @password, last_insert_rowid());

SELECT [userid]
FROM [accounts]
WHERE rowid = last_insert_rowid();
