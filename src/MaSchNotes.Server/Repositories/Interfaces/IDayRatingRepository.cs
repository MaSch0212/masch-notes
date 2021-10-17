using System;
using System.Collections.Generic;

namespace MaSch.Notes.Repositories
{
    public interface IDayRatingRepository
    {
        IDictionary<DateTime, int> GetRatings(int userId, DateTime minDate, DateTime maxDate);
        void SetRating(int userId, DateTime date, int rating);
    }
}
