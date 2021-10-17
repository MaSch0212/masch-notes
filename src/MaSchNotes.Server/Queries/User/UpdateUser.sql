UPDATE [users]
SET [givenname] = @givenname
  , [surname] = @surname
  , [email] = @email
WHERE [id] = @id
