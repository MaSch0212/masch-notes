using System;
using System.Collections.Generic;
using MaSch.Notes.Extensions;
using MaSch.Notes.Services;

namespace MaSch.Notes.Repositories
{
    public class DayRatingRepository : IDayRatingRepository
    {
        private readonly IDatabaseService _databaseService;

        public DayRatingRepository(IDatabaseService databaseService)
        {
            _databaseService = databaseService;
        }

        IDictionary<DateTime, int> IDayRatingRepository.GetRatings(int userId, DateTime minDate, DateTime maxDate)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.DayRatings.GetRatings);
            cmd.AddParameterWithValue("@userid", userId);
            cmd.AddParameterWithValue("@mindate", DateTime.SpecifyKind(minDate, DateTimeKind.Unspecified).ToString("o"));
            cmd.AddParameterWithValue("@maxdate", DateTime.SpecifyKind(maxDate, DateTimeKind.Unspecified).ToString("o"));

            var result = new Dictionary<DateTime, int>();
            using var reader = cmd.ExecuteReader();
            var dateIdx = reader.GetOrdinal("date");
            var ratingIdx = reader.GetOrdinal("rating");
            while (reader.Read())
                result.Add(reader.GetDateTime(dateIdx).Date, reader.GetInt32(ratingIdx));
            return result;
        }

        void IDayRatingRepository.SetRating(int userId, DateTime date, int rating)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.DayRatings.SetRating);
            cmd.AddParameterWithValue("@userid", userId);
            cmd.AddParameterWithValue("@date", DateTime.SpecifyKind(date, DateTimeKind.Unspecified).ToString("o"));
            cmd.AddParameterWithValue("@rating", rating);

            cmd.ExecuteNonQuery();
        }
    }
}
