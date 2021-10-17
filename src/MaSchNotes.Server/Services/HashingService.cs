using System;
using System.Linq;
using System.Security.Cryptography;

namespace MaSch.Notes.Services
{
    public class HashingService : IHashingService
    {
        public static readonly string Pbkdf2AlgorihtmName = "pbkdf2";

        public static readonly string AlgorithmName = Pbkdf2AlgorihtmName;
        public static readonly int SaltSize = 8;
        public static readonly int HashSize = 24;
        public static readonly int IterationCount = 5000;

        public static readonly int AlgorithmIndex = 0;
        public static readonly int IterationIndex = 1;
        public static readonly int SaltIndex = 2;
        public static readonly int HashIndex = 3;

        public static readonly char Separator = ':';

        public byte[] CreateSalt(int saltSize)
        {
            var cryptoProvider = new RNGCryptoServiceProvider();
            byte[] salt = new byte[saltSize];
            cryptoProvider.GetBytes(salt);
            return salt;
        }

        public string CreateHash(string password)
        {
            var salt = CreateSalt(SaltSize);
            var hash = GetPbkdf2Bytes(password, salt, IterationCount, HashSize);
            return string.Concat(AlgorithmName, Separator, IterationCount, Separator, Base64(salt), Separator, Base64(hash));
        }

        public string CreateRawHash(string password, string algorithmName, byte[] salt, int iterations, int hashSize)
        {
            byte[] hash;

            if (algorithmName == Pbkdf2AlgorihtmName)
                hash = GetPbkdf2Bytes(password, salt, iterations, hashSize);
            else
                throw new NotSupportedException($"The hash algorithm \"{algorithmName}\" is not supported.");

            return Base64(hash);
        }

        public bool ValidateHash(string password, string correctHash)
        {
            var split = correctHash.Split(Separator);
            var algoName = split[AlgorithmIndex];
            var iterations = int.Parse(split[IterationIndex]);
            var salt = Base64(split[SaltIndex]);
            var hash = Base64(split[HashIndex]);

            byte[] testHash;
            if (algoName == Pbkdf2AlgorihtmName)
                testHash = GetPbkdf2Bytes(password, salt, iterations, hash.Length);
            else
                throw new NotSupportedException($"The hash algorithm \"{algoName}\" is not supported.");

            return hash.SequenceEqual(testHash);
        }

        private static byte[] GetPbkdf2Bytes(string password, byte[] salt, int iterations, int hashSize)
        {
            var pbkdf2 = new Rfc2898DeriveBytes(password ?? string.Empty, salt);
            pbkdf2.IterationCount = iterations;
            return pbkdf2.GetBytes(hashSize);
        }

        private static string Base64(byte[] bytes) => Convert.ToBase64String(bytes);
        private static byte[] Base64(string data) => Convert.FromBase64String(data);
    }
}
