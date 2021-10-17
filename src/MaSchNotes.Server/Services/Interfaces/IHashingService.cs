namespace MaSch.Notes.Services
{
    public interface IHashingService
    {
        byte[] CreateSalt(int saltSize);
        string CreateHash(string password);
        string CreateRawHash(string password, string algorithmName, byte[] salt, int iterations, int hashSize);
        bool ValidateHash(string password, string correctHash);
    }
}
