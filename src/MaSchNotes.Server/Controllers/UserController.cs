using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MaSch.Notes.Common;
using MaSch.Notes.Models;
using MaSch.Notes.Models.Response;
using MaSch.Notes.Services;

namespace MaSch.Notes.Controllers
{
    [Authorize]
    [Route("api/user")]
    [ApiController]
    public class UserController : ControllerBase
    {
        private readonly ISessionService _sessionService;

        public UserController(ISessionService sessionService)
        {
            _sessionService = sessionService;
        }

        [HttpGet]
        public IActionResult GetUserInfo()
        {
            try
            {
                var user = _sessionService.GetUserInfo(_sessionService.GetUserId(User));
                return Ok(user);
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpPost("edit")]
        public IActionResult EditUserInfo([FromBody] User newInfo)
        {
            try
            {
                var token = _sessionService.EditUserInfoAndRetrieveNewToken(User, newInfo);
                return Ok(new LoginResponse
                {
                    IsSuccess = true,
                    Token = token
                });
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }
    }
}
