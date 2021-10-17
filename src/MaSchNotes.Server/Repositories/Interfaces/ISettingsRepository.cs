using System;
using System.Collections.Generic;

namespace MaSch.Notes.Repositories
{
    public interface ISettingsRepository
    {
        string GetSetting(int userId, int settingId);
        IDictionary<int, string> GetSettings(int userId);

        void SetSetting(int userId, int settingId, string value);

        IList<(int id, string name, DateTime timestamp)> GetAllApiKeysOfUser(int userId);
        int CreateApiKey(string key, string name, int userId, DateTime timestamp);
        int? GetUserIdOfApiKey(int keyId);
        int? GetUserIdOfApiKey(string key);
        void RemoveApiKey(int keyId);
    }
}
