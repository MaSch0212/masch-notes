SELECT [date], [rating]
FROM [dayratings]
WHERE [userid] = @userid AND [date] >= @mindate AND [date] <= @maxdate
