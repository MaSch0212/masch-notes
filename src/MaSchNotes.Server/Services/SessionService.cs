using System;
using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using MaSch.Notes.Common;
using MaSch.Notes.Models;
using MaSch.Notes.Repositories;
using static MaSch.Notes.Services.HashingService;

namespace MaSch.Notes.Services
{
    public class SessionService : ISessionService
    {
        private static readonly string DefaultEncryptKeyParams = string.Join(Separator, new[]
        {
            Pbkdf2AlgorihtmName,    // Algorithm Name
            "5000",                 // Iteration Count
            "{0}",                  // Placeholder for salt
            "32"                    // Hash Size
        });

        // https://yogeshdotnet.com/jwtjson-web-token-authentication-and-authorization-in-asp-net-core-2-1-with-example/

        private readonly IConfiguration _config;
        private readonly IHashingService _hashingService;
        private readonly IUserRepository _userRepository;
        private readonly ISettingsService _settingsService;
        private readonly ISettingsRepository _settingsRepository;

        public SessionService(IConfiguration config, IHashingService hashingService, IUserRepository userRepository, ISettingsService settingsService, ISettingsRepository settingsRepository)
        {
            _config = config;
            _hashingService = hashingService;
            _userRepository = userRepository;
            _settingsService = settingsService;
            _settingsRepository = settingsRepository;
        }

        public string Authenticate(string username, string password, bool stayLoggedIn)
        {
            var correctHash = _userRepository.GetUserPasswordHash(username);
            if (ValidatePassword(correctHash, password))
            {
                var user = _userRepository.GetUserByUsername(username);
                if (user == null)
                    return null;
                return GenerateToken(user, GetTokenExpirationDate(stayLoggedIn));
            }
            else
                return null;
        }

        public string Register(string username, string password, User userInfo)
        {
            if (_userRepository.IsUsernameGiven(username))
                throw new ValidationException(StatusCodes.Status400BadRequest, "The username already exists.");

            var passwordHash = _hashingService.CreateHash(password);
            _userRepository.CreateUser(username, passwordHash, userInfo);
            return GenerateToken(userInfo, GetTokenExpirationDate(false));
        }

        public void ChangePassword(int userId, string oldPassword, string newPassword)
        {
            var account = _userRepository.GetFirstAccountOfUser(userId);
            if (!account.HasValue)
                throw new ValidationException(StatusCodes.Status404NotFound, "No account for the user was found.");

            if (!ValidatePassword(account.Value.passwordHash, oldPassword))
                throw new ValidationException(StatusCodes.Status401Unauthorized, "The old password is not correct.");

            var hash = _hashingService.CreateHash(newPassword);
            _userRepository.ChangePassword(account.Value.username, hash);
        }

        public User GetUserInfo(int userId)
        {
            return _userRepository.GetUserById(userId);
        }

        public string EditUserInfoAndRetrieveNewToken(ClaimsPrincipal user, User newInfo)
        {
            if (GetUserId(user) != newInfo.Id)
                throw new ValidationException(StatusCodes.Status400BadRequest, "The user id of the information does not match the current user.");

            _userRepository.UpdateUser(newInfo);

            return DateTime.TryParse(user.Claims.SingleOrDefault(x => x.Type == ClaimTypes.Expiration).Value.Trim('\"'), out DateTime e)
                ? GenerateToken(newInfo, e)
                : null;
        }

        public int GetUserId(ClaimsPrincipal user)
        {
            return int.Parse(user.Claims.Single(x => x.Type == ClaimTypes.NameIdentifier).Value);
        }

        public string GetEncryptKey(int userId, string encryptPass)
        {
            var rawHashParams = _settingsService.GetHiddenSetting(userId, Settings.HiddenSettingNames.EncryptKeyParams);
            string[] hashParms;
            if (rawHashParams == null || (hashParms = rawHashParams.Split(':')).Length < 4)
            {
                var s = _hashingService.CreateSalt(16);
                rawHashParams = string.Format(DefaultEncryptKeyParams, Convert.ToBase64String(s));
                hashParms = rawHashParams.Split(':');
                _settingsService.SetHiddenSetting(userId, Settings.HiddenSettingNames.EncryptKeyParams, rawHashParams);
            }

            var algorithmName = hashParms[AlgorithmIndex];
            var iterations = int.Parse(hashParms[IterationIndex]);
            var salt = Convert.FromBase64String(hashParms[SaltIndex]);
            var hashSize = int.Parse(hashParms[HashIndex]);
            return _hashingService.CreateRawHash(encryptPass, algorithmName, salt, iterations, hashSize);
        }

        private DateTime GetTokenExpirationDate(bool stayLoggedIn)
        {
            return stayLoggedIn ? DateTime.UtcNow.AddYears(1) : DateTime.UtcNow.AddHours(2);
        }

        private string GenerateToken(User user, DateTime expires)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["JWT:Key"]));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha512);

            var token = new JwtSecurityToken(_config["JWT:Issuer"],
                _config["JWT:Audience"],
                claims: new Claim[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString(CultureInfo.InvariantCulture)),
                    new Claim(ClaimTypes.GivenName, user.GivenName),
                    new Claim(ClaimTypes.Surname, user.Surname),
                    new Claim(ClaimTypes.Email, user.Email),
                    new Claim(ClaimTypes.Expiration, expires.ToUniversalTime().ToString("o"))
                },
                expires: expires,
                signingCredentials: creds);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private bool ValidatePassword(string correctHash, string password)
        {
            return !string.IsNullOrEmpty(correctHash) && _hashingService.ValidateHash(password, correctHash) || string.IsNullOrEmpty(correctHash) && string.IsNullOrEmpty(password);
        }

        public User ValidateApiKey(string key)
        {
            var userId = _settingsRepository.GetUserIdOfApiKey(key);
            if (!userId.HasValue)
                throw new ValidationException(StatusCodes.Status401Unauthorized, $"The api key {key} does not exist.");
            return _userRepository.GetUserById(userId.Value);
        }
    }
}
