using System.Collections.Generic;
using MaSch.Notes.Models;

namespace MaSch.Notes.Services
{
    public interface ISettingsService
    {
        Settings GetSettings(int userId);
        T GetSetting<T>(int userId, string settingName);

        void UpdateSettings(int userId, Settings updatedSettings);

        string GetHiddenSetting(int userId, int settingId);
        void SetHiddenSetting(int userId, int settingId, string value);

        (string key, ApiKey keyInfo) CreateApiKey(int userId, string name);
        void RemoveApiKey(int userId, int keyId);
    }
}
