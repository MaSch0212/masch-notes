namespace MaSch.Notes.Models.Request
{
    public class RegisterRequest
    {
        public User UserInfo { get; set; }
        public string Username { get; set; }
        public string Password { get; set; }
    }
}
