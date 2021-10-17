using System.Collections.Generic;
using MaSch.Notes.Models;

namespace MaSch.Notes.Repositories
{
    public interface INotebookRepository
    {
        IList<Notebook> GetNotebooks(int userId);
        IList<NotebookEntry> GetNotebookEntries(int notebookId, bool includeContent);

        int? GetUserIdOfNotebook(int notebookId);
        int? GetNotebookIdOfEntry(int notebookEntryId);

        int AddNotebook(int userId, Notebook notebook);
        Notebook GetNotebook(int notebookId);
        void UpdateNotebook(Notebook notebook);
        void DeleteNotebook(int notebookId);

        int AddNotebookEntry(int notebookId, NotebookEntry entry);
        NotebookEntry GetNotebookEntry(int notebookEntryId);
        void UpdateNotebookEntry(NotebookEntry entry);
        void DeleteNotebookEntry(int notebookEntryId);

        IList<string> GetNotebookCategories(int notebookId);
    }
}
