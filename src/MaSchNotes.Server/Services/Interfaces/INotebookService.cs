using System.Collections.Generic;
using MaSch.Notes.Models;

namespace MaSch.Notes.Services
{
    public interface INotebookService
    {
        IList<Notebook> GetNotebooks(int userId, bool loadEntries, bool includeContent);
        IList<NotebookEntry> GetNotebookEntries(int userId, int notebookId, bool includeContent);

        int AddNotebook(int userId, Notebook notebook);
        Notebook GetNotebook(int userId, int notebookId, bool loadEntries, bool includeContent);
        void UpdateNotebook(int userId, int notebookId, Notebook notebook);
        void DeleteNotebook(int userId, int notebookId);

        int AddNotebookEntry(int userId, int notebookId, NotebookEntry entry);
        NotebookEntry GetNotebookEntry(int userId, int notebookId, int notebookEntryId);
        void UpdateNotebookEntry(int userId, int notebookId, int notebookEntryId, NotebookEntry entry);
        void DeleteNotebookEntry(int userId, int notebookId, int notebookEntryId);

        IList<string> GetNotebookCategories(int userId, int notebookId);
    }
}
