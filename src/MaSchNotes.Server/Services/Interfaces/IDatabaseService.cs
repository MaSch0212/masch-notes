using System.Data;

namespace MaSch.Notes.Services
{
    public interface IDatabaseService
    {
        IDbConnection Database { get; }

        IDbCommand CreateCommand(string queryString);
    }
}
