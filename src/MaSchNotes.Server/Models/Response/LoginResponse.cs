namespace MaSch.Notes.Models.Response
{
    public class LoginResponse
    {
        public bool IsSuccess { get; set; }
        public string Token { get; set; }
        public string EncryptPass { get; set; }
    }
}
