using System.Collections.Generic;
using MaSch.Notes.Models;
using MaSch.Notes.Services;
using MaSch.Notes.Extensions;
using System.Data;
using System;
using System.Linq;

namespace MaSch.Notes.Repositories
{
    public class NotebookRepository : INotebookRepository
    {
        private readonly IDatabaseService _databaseService;

        public NotebookRepository(IDatabaseService databaseService)
        {
            _databaseService = databaseService;
        }

        public IList<Notebook> GetNotebooks(int userId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.GetNotebooks);
            cmd.AddParameterWithValue("@userid", userId);

            using var reader = cmd.ExecuteReader();
            return GetNotebooks(reader).ToArray();
        }

        public IList<NotebookEntry> GetNotebookEntries(int notebookId, bool includeContent)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.GetNotebookEntries);
            cmd.AddParameterWithValue("@notebookid", notebookId);
            cmd.AddParameterWithValue("@includecontent", includeContent);

            using var reader = cmd.ExecuteReader();
            return GetNotebookEntries(reader).ToArray();
        }


        public int? GetUserIdOfNotebook(int notebookId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.GetUserIdOfNotebook);
            cmd.AddParameterWithValue("@notebookid", notebookId);

            var result = cmd.ExecuteScalar();
            return result == null || result == DBNull.Value ? (int?)null : Convert.ToInt32(result);
        }

        public int? GetNotebookIdOfEntry(int notebookEntryId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.GetNotebookIdOfEntry);
            cmd.AddParameterWithValue("@entryid", notebookEntryId);

            var result = cmd.ExecuteScalar();
            return result == null || result == DBNull.Value ? (int?)null : Convert.ToInt32(result);
        }


        public int AddNotebook(int userId, Notebook notebook)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.CreateNotebook);
            cmd.AddParameterWithValue("@userid", userId);
            cmd.AddParameterWithValue("@name", notebook.Name);
            cmd.AddParameterWithValue("@isdiary", notebook.IsDiary);

            return Convert.ToInt32(cmd.ExecuteScalar());
        }

        public Notebook GetNotebook(int notebookId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.GetNotebook);
            cmd.AddParameterWithValue("@notebookid", notebookId);

            using var reader = cmd.ExecuteReader();
            var result = GetNotebooks(reader).FirstOrDefault();
            result.Id = notebookId;
            return result;
        }

        public void UpdateNotebook(Notebook notebook)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.UpdateNotebook);
            cmd.AddParameterWithValue("@notebookid", notebook.Id);
            cmd.AddParameterWithValue("@name", notebook.Name);

            cmd.ExecuteNonQuery();
        }

        public void DeleteNotebook(int notebookId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.DeleteNotebook);
            cmd.AddParameterWithValue("@notebookid", notebookId);

            cmd.ExecuteNonQuery();
        }


        public int AddNotebookEntry(int notebookId, NotebookEntry entry)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.CreateNotebookEntry);
            cmd.AddParameterWithValue("@notebookid", notebookId);
            cmd.AddParameterWithValue("@name", entry.Name);
            cmd.AddParameterWithValue("@category", entry.Category);
            cmd.AddParameterWithValue("@date", entry.Date);
            cmd.AddParameterWithValue("@content", Convert.FromBase64String(entry.Content));

            return Convert.ToInt32(cmd.ExecuteScalar());
        }

        public NotebookEntry GetNotebookEntry(int notebookEntryId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.GetNotebookEntry);
            cmd.AddParameterWithValue("@entryid", notebookEntryId);

            using var reader = cmd.ExecuteReader();
            var result = GetNotebookEntries(reader).FirstOrDefault();
            result.Id = notebookEntryId;
            return result;
        }

        public void UpdateNotebookEntry(NotebookEntry entry)
        {
            using (var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.UpdateNotebookEntry))
            {
                cmd.AddParameterWithValue("@entryid", entry.Id);
                cmd.AddParameterWithValue("@name", entry.Name);
                cmd.AddParameterWithValue("@category", entry.Category);
                cmd.AddParameterWithValue("@date", entry.Date == null ? null : DateTime.SpecifyKind(entry.Date.Value.Date, DateTimeKind.Unspecified).ToString("o"));
                cmd.AddParameterWithValue("@content", Convert.FromBase64String(entry.Content));

                cmd.ExecuteNonQuery();
            }

            DeleteUnusedCategories();
        }

        public void DeleteNotebookEntry(int notebookEntryId)
        {
            using (var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.DeleteNotebookEntry))
            {
                cmd.AddParameterWithValue("@entryid", notebookEntryId);

                cmd.ExecuteNonQuery();
            }

            DeleteUnusedCategories();
        }

        public IList<string> GetNotebookCategories(int notebookId)
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.GetNotebookCategories);
            cmd.AddParameterWithValue("@notebookid", notebookId);

            using var reader = cmd.ExecuteReader();
            return GetStrings(reader).ToArray();
        }


        private void DeleteUnusedCategories()
        {
            using var cmd = _databaseService.CreateCommand(SqlQueryAccessor.Notebooks.DeleteUnusedCategories);
            cmd.ExecuteNonQuery();
        }

        private static IEnumerable<Notebook> GetNotebooks(IDataReader reader)
        {
            var idIdx = reader.TryGetOrdinal("id");
            var nameIdx = reader.TryGetOrdinal("name");
            var isDiaryIdx = reader.TryGetOrdinal("isdiary");
            while (reader.Read())
            {
                var notebook = new Notebook();
                if (idIdx.HasValue)
                    notebook.Id = reader.GetInt32(idIdx.Value);
                if (nameIdx.HasValue)
                    notebook.Name = reader.GetString(nameIdx.Value);
                if (isDiaryIdx.HasValue)
                    notebook.IsDiary = reader.GetBoolean(isDiaryIdx.Value);
                yield return notebook;
            }
        }

        private static IEnumerable<NotebookEntry> GetNotebookEntries(IDataReader reader)
        {
            var idIdx = reader.TryGetOrdinal("id");
            var nameIdx = reader.TryGetOrdinal("name");
            var categoryIdx = reader.TryGetOrdinal("category");
            var dateIdx = reader.TryGetOrdinal("date");
            var contentIdx = reader.TryGetOrdinal("content");
            while (reader.Read())
            {
                var entry = new NotebookEntry();
                if (idIdx.HasValue)
                    entry.Id = reader.GetInt32(idIdx.Value);
                if (nameIdx.HasValue)
                    entry.Name = reader.IsDBNull(nameIdx.Value) ? null : reader.GetString(nameIdx.Value);
                if (categoryIdx.HasValue)
                    entry.Category = reader.IsDBNull(categoryIdx.Value) ? null : reader.GetString(categoryIdx.Value);
                if (dateIdx.HasValue)
                    entry.Date = reader.IsDBNull(dateIdx.Value) ? (DateTime?)null : reader.GetDateTime(dateIdx.Value).Date;
                if (contentIdx.HasValue && !reader.IsDBNull(contentIdx.Value))
                {
                    long dataLength = reader.GetBytes(contentIdx.Value, 0, null, 0, 0);
                    byte[] data = new byte[dataLength];
                    reader.GetBytes(contentIdx.Value, 0, data, 0, (int)dataLength);
                    entry.Content = Convert.ToBase64String(data);
                }
                yield return entry;
            }
        }

        private static IEnumerable<string> GetStrings(IDataReader reader)
        {
            while(reader.Read())
            {
                yield return reader.IsDBNull(0) ? null : reader.GetString(0);
            }
        }
    }
}
