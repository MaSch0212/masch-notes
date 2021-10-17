using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using MaSch.Notes.Common;
using MaSch.Notes.Models.Request;
using MaSch.Notes.Models.Response;
using MaSch.Notes.Services;
using System.Text;

namespace MaSch.Notes.Controllers
{
    [Authorize]
    [Route("api/auth")]
    [ApiController]
    public class AuthenticationController : ControllerBase
    {
        private IConfiguration _config;
        private ISessionService _sessionService;
        private IHashingService _hashingService;

        public AuthenticationController(IConfiguration config, ISessionService sessionService, IHashingService hashingService)
        {
            _config = config;
            _sessionService = sessionService;
            _hashingService = hashingService;
        }

        [AllowAnonymous]
        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.Username))
                return BadRequest("Missing information");

            var token = _sessionService.Authenticate(request.Username, request.Password, request.StayLoggedIn);
            if (string.IsNullOrEmpty(token))
                return Unauthorized();
            return Ok(new LoginResponse
            {
                IsSuccess = true,
                Token = token,
                EncryptPass = _hashingService.CreateRawHash(request.Username, HashingService.Pbkdf2AlgorihtmName, Encoding.UTF8.GetBytes(request.Password), 5000, 64)
            });
        }

        [AllowAnonymous]
        [HttpPost("register")]
        public IActionResult Register([FromBody] RegisterRequest request)
        {
            if (request == null || string.IsNullOrEmpty(request.Username) ||
                request.UserInfo == null || string.IsNullOrEmpty(request.UserInfo.GivenName) ||
                string.IsNullOrEmpty(request.UserInfo.Surname) || string.IsNullOrEmpty(request.UserInfo.Email))
            {
                return BadRequest("Missing information");
            }

            try
            {
                var token = _sessionService.Register(request.Username, request.Password, request.UserInfo);
                return Ok(new LoginResponse
                {
                    IsSuccess = true,
                    Token = token
                });
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpPost("changepassword")]
        public IActionResult ChangePassword([FromBody] ChangePasswordRequest request)
        {
            if (request == null || request.UserId <= 0)
                return BadRequest("Missing information");

            try
            {
                //_sessionService.ChangePassword(request.UserId, request.OldPassword, request.NewPassword);
                //return Ok();
                return BadRequest("Currently not supported");
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpPost("encryptkey")]
        public IActionResult CreateEncryptKey([FromBody] CreateEncryptKeyRequest request)
        {
            if (request == null || string.IsNullOrWhiteSpace(request.EncryptPass))
                return BadRequest("Missing information");

            try
            {
                var key = _sessionService.GetEncryptKey(_sessionService.GetUserId(User), request.EncryptPass);
                return Ok(new CreateEncryptKeyResponse
                {
                    EncryptKey = key
                });
            }
            catch (ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpGet("check")]
        public IActionResult CheckToken()
        {
            return Ok();
        }
    }
}
