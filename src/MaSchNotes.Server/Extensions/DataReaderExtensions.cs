using System;
using System.Data;

namespace MaSch.Notes.Extensions
{
    public static class DataReaderExtensions
    {
        public static int? TryGetOrdinal(this IDataReader reader, string columnName)
        {
            try { return reader.GetOrdinal(columnName); }
            catch(ArgumentOutOfRangeException) { return null; }
        }
    }
}
