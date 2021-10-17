using System;
using System.Linq;
using MaSch.Notes.Common;
using MaSch.Notes.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MaSch.Notes.Controllers
{
    [Authorize]
    [Route("api/dayratings")]
    [ApiController]
    public class DayRatingsController : ControllerBase
    {
        private readonly ISessionService _sessionService;
        private readonly IDayRatingService _dayRatingService;

        private int UserId => _sessionService.GetUserId(User);

        public DayRatingsController(ISessionService sessionService, IDayRatingService dayRatingService)
        {
            _sessionService = sessionService;
            _dayRatingService = dayRatingService;
        }

        [HttpGet]
        public IActionResult GetRatings(DateTime? minDate = null, DateTime? maxDate = null)
        {
            try
            {
                var ratings = _dayRatingService.GetRatings(UserId, minDate ?? DateTime.MinValue, maxDate ?? DateTime.MaxValue);
                return Ok(ratings);
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpGet("{date}")]
        public IActionResult GetRating(DateTime date)
        {
            try
            {
                var ratings = _dayRatingService.GetRatings(UserId, date, date);
                return Ok(ratings.Count > 0 ? (int?)ratings.Values.First() : null);
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpPut("{date}")]
        public IActionResult SetRating(DateTime date, [FromBody] int rating)
        {
            try
            {
                _dayRatingService.SetRating(UserId, date, rating);
                return Ok();
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }
    }
}
