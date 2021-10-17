using System.Collections.Generic;
using System.Net;
using MaSch.Notes.Common;
using MaSch.Notes.Models;
using MaSch.Notes.Repositories;

namespace MaSch.Notes.Services
{
    public class NotebookService : INotebookService
    {
        private readonly INotebookRepository _notebookRepository;

        public NotebookService(INotebookRepository notebookRepository)
        {
            _notebookRepository = notebookRepository;
        }


        public IList<Notebook> GetNotebooks(int userId, bool loadEntries, bool includeContent)
        {
            var result = _notebookRepository.GetNotebooks(userId);
            if (loadEntries)
            {
                foreach (var notebook in result)
                    notebook.Entries = _notebookRepository.GetNotebookEntries(notebook.Id, includeContent);
            }
            return result;
        }

        public IList<NotebookEntry> GetNotebookEntries(int userId, int notebookId, bool includeContent)
        {
            VerifyNotebook(userId, notebookId);
            return _notebookRepository.GetNotebookEntries(notebookId, includeContent);
        }


        public int AddNotebook(int userId, Notebook notebook)
        {
            if (notebook == null)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "No notebook has been provided.");
            return _notebookRepository.AddNotebook(userId, notebook);
        }

        public Notebook GetNotebook(int userId, int notebookId, bool loadEntries, bool includeContent)
        {
            VerifyNotebook(userId, notebookId);
            var result = _notebookRepository.GetNotebook(notebookId);
            if (loadEntries)
                result.Entries = _notebookRepository.GetNotebookEntries(notebookId, includeContent);
            return result;
        }

        public void UpdateNotebook(int userId, int notebookId, Notebook notebook)
        {
            if (notebook == null)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "No notebook has been provided.");
            if (notebook.Id != notebookId)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "The id of the provided notebook differs from the provided notebookId.");
            VerifyNotebook(userId, notebookId);
            _notebookRepository.UpdateNotebook(notebook);
        }

        public void DeleteNotebook(int userId, int notebookId)
        {
            VerifyNotebook(userId, notebookId);
            _notebookRepository.DeleteNotebook(notebookId);
        }


        public int AddNotebookEntry(int userId, int notebookId, NotebookEntry entry)
        {
            if (entry == null)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "No entry has been provided.");
            VerifyNotebook(userId, notebookId);
            return _notebookRepository.AddNotebookEntry(notebookId, entry);
        }

        public NotebookEntry GetNotebookEntry(int userId, int notebookId, int notebookEntryId)
        {
            VerifyNotebookEntry(userId, notebookId, notebookEntryId);
            return _notebookRepository.GetNotebookEntry(notebookEntryId);
        }

        public void UpdateNotebookEntry(int userId, int notebookId, int notebookEntryId, NotebookEntry entry)
        {
            if (entry == null)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "No notebook entry has been provided.");
            if (entry.Id != notebookEntryId)
                throw new ValidationException((int)HttpStatusCode.BadRequest, "The id of the provided notebook entry differs from the provided notebookEntryId.");
            VerifyNotebookEntry(userId, notebookId, entry.Id);
            _notebookRepository.UpdateNotebookEntry(entry);
        }

        public void DeleteNotebookEntry(int userId, int notebookId, int notebookEntryId)
        {
            VerifyNotebookEntry(userId, notebookId, notebookEntryId);
            _notebookRepository.DeleteNotebookEntry(notebookEntryId);
        }


        public IList<string> GetNotebookCategories(int userId, int notebookId)
        {
            VerifyNotebook(userId, notebookId);
            return _notebookRepository.GetNotebookCategories(notebookId);
        }


        private void VerifyNotebook(int userId, int notebookId)
        {
            var realUserId = _notebookRepository.GetUserIdOfNotebook(notebookId);
            if (realUserId == null)
                throw new ValidationException((int)HttpStatusCode.NotFound, $"A notebook with id {notebookId} does not exist.");
            if (realUserId.Value != userId)
                throw new ValidationException((int)HttpStatusCode.Unauthorized, $"You do not have access to notebook with id {notebookId} because it is owned by another user.");
        }

        private void VerifyNotebookEntry(int userId, int notebookId, int notebookEntryId)
        {
            VerifyNotebook(userId, notebookId);
            var realNotebookId = _notebookRepository.GetNotebookIdOfEntry(notebookEntryId);
            if (realNotebookId == null)
                throw new ValidationException((int)HttpStatusCode.NotFound, $"An entry with id {notebookEntryId} does not exist.");
            if (realNotebookId.Value != notebookId)
                throw new ValidationException((int)HttpStatusCode.BadRequest, $"The entry with id {notebookEntryId} is not in entry of notebook with id {notebookId}.");
        }
    }
}
