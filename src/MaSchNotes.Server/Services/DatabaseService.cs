using System;
using System.Data;
using System.Diagnostics;
using System.IO;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace MaSch.Notes.Services
{
    public class DatabaseService : IDatabaseService
    {
        private readonly ILogger _logger;
        private readonly IConfiguration _configuration;

        private IDbConnection _database;
        public IDbConnection Database => _database ??= CreateDatabaseConnection(_logger);

        public DatabaseService(ILogger<DatabaseService> logger, IConfiguration configuration)
        {
            _logger = logger;
            _configuration = configuration;
        }

        public IDbCommand CreateCommand(string queryString)
        {
            var result = Database.CreateCommand();
            result.CommandText = queryString;
            return result;
        }

        private IDbConnection CreateDatabaseConnection(ILogger logger)
        {
            var dataPath = _configuration["DOTNET_RUNNING_IN_CONTAINER"] == "true" ? "/data" : Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "Data");
            var file = Path.Combine(dataPath, "maschnotes.db");
            //bool isNew = !File.Exists(file);
            logger.LogInformation("Database file: " + file);

            Directory.CreateDirectory(Path.GetDirectoryName(file));
            var connectionString = $"Mode=ReadWriteCreate;Data Source={file};Cache=Shared;";

            var connection = new SqliteConnection(connectionString);
            connection.Open();
            CreateTables(connection);
            return connection;
        }

        private static void CreateTables(IDbConnection connection)
        {
            using var cmd = connection.CreateCommand();
            cmd.CommandText = SqlQueryAccessor.CreateTables;
            cmd.ExecuteNonQuery();
        }
    }
}
