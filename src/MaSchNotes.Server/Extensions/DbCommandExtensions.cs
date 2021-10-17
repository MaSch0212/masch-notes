using System;
using System.Data;

namespace MaSch.Notes.Extensions
{
    public static class DbCommandExtensions
    {
        public static void AddParameterWithValue(this IDbCommand command, string paramName, object value)
        {
            var param = command.CreateParameter();
            param.ParameterName = paramName;
            param.Value = value ?? DBNull.Value;
            command.Parameters.Add(param);
        }
    }
}
