UPDATE [accounts]
SET [password] = @password
WHERE [name] = @name COLLATE NOCASE
