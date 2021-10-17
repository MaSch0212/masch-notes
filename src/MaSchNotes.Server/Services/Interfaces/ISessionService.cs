using System.Security.Claims;
using MaSch.Notes.Models;

namespace MaSch.Notes.Services
{
    public interface ISessionService
    {
        string Authenticate(string username, string password, bool stayLoggedIn);
        string Register(string username, string password, User userInfo);
        void ChangePassword(int userId, string oldPassword, string newPassword);

        User GetUserInfo(int userId);
        string EditUserInfoAndRetrieveNewToken(ClaimsPrincipal user, User newInfo);

        int GetUserId(ClaimsPrincipal user);
        string GetEncryptKey(int userId, string encryptPass);

        User ValidateApiKey(string key);
    }
}
