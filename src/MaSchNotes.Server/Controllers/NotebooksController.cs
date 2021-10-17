using MaSch.Notes.Common;
using MaSch.Notes.Models;
using MaSch.Notes.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MaSchNotes.Controllers
{
    [Authorize]
    [Route("api/notebooks")]
    [ApiController]
    public class NotebooksController : Controller
    {
        private readonly ISessionService _sessionService;
        private readonly INotebookService _notebookService;

        private int UserId => _sessionService.GetUserId(User);

        public NotebooksController(ISessionService sessionService, INotebookService notebookService)
        {
            _sessionService = sessionService;
            _notebookService = notebookService;
        }


        [HttpGet]
        public IActionResult GetNotebooks(bool loadEntries = false, bool includeContent = false)
        {
            try
            {
                var notebooks = _notebookService.GetNotebooks(UserId, loadEntries, includeContent);
                return Ok(notebooks);
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpGet("{notebookId}/entries")]
        public IActionResult GetNotebookEntries(int notebookId, bool includeContent = false)
        {
            try
            {
                var notebookEntries = _notebookService.GetNotebookEntries(UserId, notebookId, includeContent);
                return Ok(notebookEntries);
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }


        [HttpPut]
        public IActionResult AddNotebook([FromBody] Notebook notebook)
        {
            try
            {
                var notebookId = _notebookService.AddNotebook(UserId, notebook);
                return Ok(notebookId);
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpGet("{id}")]
        public IActionResult GetNotebook(int id, bool loadEntries = false, bool includeContent = false)
        {
            try
            {
                var notebook = _notebookService.GetNotebook(UserId, id, loadEntries, includeContent);
                return Ok(notebook);
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpPost("{id}")]
        public IActionResult UpdateNotebook(int id, [FromBody] Notebook notebook)
        {
            try
            {
                _notebookService.UpdateNotebook(UserId, id, notebook);
                return Ok();
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpDelete("{id}")]
        public IActionResult DeleteNotebook(int id)
        {
            try
            {
                _notebookService.DeleteNotebook(UserId, id);
                return Ok();
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }


        [HttpPut("{notebookId}")]
        public IActionResult AddNotebookEntry(int notebookId, [FromBody] NotebookEntry entry)
        {
            try
            {
                var entryId = _notebookService.AddNotebookEntry(UserId, notebookId, entry);
                return Ok(entryId);
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpGet("{notebookId}/{id}")]
        public IActionResult GetNotebookEntry(int notebookId, int id)
        {
            try
            {
                var entry = _notebookService.GetNotebookEntry(UserId, notebookId, id);
                return Ok(entry);
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpPost("{notebookId}/{id}")]
        public IActionResult UpdateNotebookEntry(int notebookId, int id, [FromBody] NotebookEntry entry)
        {
            try
            {
                _notebookService.UpdateNotebookEntry(UserId, notebookId, id, entry);
                return Ok();
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }

        [HttpDelete("{notebookId}/{id}")]
        public IActionResult DeleteNotebookEntry(int notebookId, int id)
        {
            try
            {
                _notebookService.DeleteNotebookEntry(UserId, notebookId, id);
                return Ok();
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }


        [HttpGet("{notebookId}/categories")]
        public IActionResult GetNotebookCategories(int notebookId)
        {
            try
            {
                var categories = _notebookService.GetNotebookCategories(UserId, notebookId);
                return Ok(categories);
            }
            catch(ValidationException ex) { return StatusCode(ex.StatusCode, ex.Message); }
        }
    }
}
