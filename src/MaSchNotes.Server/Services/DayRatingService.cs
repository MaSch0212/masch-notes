using System;
using System.Collections.Generic;
using System.Net;
using MaSch.Notes.Common;
using MaSch.Notes.Repositories;

namespace MaSch.Notes.Services
{
    public class DayRatingService : IDayRatingService
    {
        private readonly IDayRatingRepository _dayRatingRepository;

        public DayRatingService(IDayRatingRepository dayRatingRepository)
        {
            _dayRatingRepository = dayRatingRepository;
        }

        public IDictionary<DateTime, int> GetRatings(int userId, DateTime minDate, DateTime maxDate)
        {
            if (minDate.Date > maxDate.Date)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "The minimum date needs to be before or equal to the maximum date.");
            return _dayRatingRepository.GetRatings(userId, minDate.Date, maxDate.Date);
        }

        public void SetRating(int userId, DateTime date, int rating)
        {
            if (rating < 0 || rating > 4)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "The rating needs to be a value between 0 and 4.");
            _dayRatingRepository.SetRating(userId, date.Date, rating);
        }
    }
}
