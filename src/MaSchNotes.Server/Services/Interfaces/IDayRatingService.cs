using System;
using System.Collections.Generic;

namespace MaSch.Notes.Services
{
    public interface IDayRatingService
    {
        IDictionary<DateTime, int> GetRatings(int userId, DateTime minDate, DateTime maxDate);
        void SetRating(int userId, DateTime date, int rating);
    }
}
