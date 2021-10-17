namespace MaSch.Notes.Common
{
    [System.Serializable]
    public class ValidationException : System.Exception
    {
        public int StatusCode { get; set; }

        public ValidationException(int statusCode) { StatusCode = statusCode; }
        public ValidationException(int statusCode, string message) : base(message) { StatusCode = statusCode; }
        public ValidationException(int statusCode, string message, System.Exception inner) : base(message, inner) { StatusCode = statusCode; }
    }
}
