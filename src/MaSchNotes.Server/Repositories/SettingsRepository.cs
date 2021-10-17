using System.Collections.Generic;
using MaSch.Notes.Services;
using MaSch.Notes.Extensions;
using System;

namespace MaSch.Notes.Repositories
{
    public class SettingsRepository : ISettingsRepository
    {
        private readonly IDatabaseService _databaseService;

        public SettingsRepository(IDatabaseService databaseService)
        {
            _databaseService = databaseService;
        }

        public string GetSetting(int userId, int settingId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.GetSetting);
            cmd.AddParameterWithValue("@userid", userId);
            cmd.AddParameterWithValue("@settingid", settingId);

            return (string)cmd.ExecuteScalar();
        }

        public IDictionary<int, string> GetSettings(int userId)
        {
            var result = new Dictionary<int, string>();

            using (var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.GetSettings))
            {
                cmd.AddParameterWithValue("@userid", userId);

                using var reader = cmd.ExecuteReader();
                while (reader.Read())
                {
                    result.Add(reader.GetInt32(0), reader.GetString(1));
                }
            }

            return result;
        }

        public void SetSetting(int userId, int settingId, string value)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.SetSetting);
            cmd.AddParameterWithValue("@userid", userId);
            cmd.AddParameterWithValue("@settingid", settingId);
            cmd.AddParameterWithValue("@value", value);

            cmd.ExecuteNonQuery();
        }

        public IList<(int id, string name, DateTime timestamp)> GetAllApiKeysOfUser(int userId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.GetAllApiKeysOfUser);
            cmd.AddParameterWithValue("@userid", userId);

            using var reader = cmd.ExecuteReader();
            var result = new List<(int, string, DateTime)>();
            while (reader.Read())
                result.Add((reader.GetInt32(0), reader.GetString(1), reader.GetDateTime(2).ToUniversalTime()));
            return result;
        }

        public int CreateApiKey(string key, string name, int userId, DateTime timestamp)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.CreateApiKey);
            cmd.AddParameterWithValue("@key", key);
            cmd.AddParameterWithValue("@name", name);
            cmd.AddParameterWithValue("@userid", userId);
            cmd.AddParameterWithValue("@timestamp", timestamp.ToUniversalTime().ToString("o"));

            return (int)(long)cmd.ExecuteScalar();
        }

        public int? GetUserIdOfApiKey(int keyId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.GetUserIdOfApiKeyById);
            cmd.AddParameterWithValue("@id", keyId);

            return (int?)(long?)cmd.ExecuteScalar();
        }

        public int? GetUserIdOfApiKey(string key)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.GetUserIdOfApiKeyByKey);
            cmd.AddParameterWithValue("@key", key);

            return (int?)(long?)cmd.ExecuteScalar();
        }

        public void RemoveApiKey(int keyId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Settings.RemoveApiKey);
            cmd.AddParameterWithValue("@id", keyId);

            cmd.ExecuteNonQuery();
        }
    }
}
