using System.Collections.Generic;

namespace MaSch.Notes.Models
{
    public class Notebook
    {
        public int Id { get; set; }
        public string Name { get; set; }
        public bool IsDiary { get; set; }
        public IList<NotebookEntry> Entries { get; set; }

        public Notebook()
        {
            Entries = new List<NotebookEntry>();
        }
    }
}
