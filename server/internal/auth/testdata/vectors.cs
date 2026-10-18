#:property JsonSerializerIsReflectionEnabledByDefault=true
#:property PublishAot=false
// Generates legacy crypto test vectors exactly like the old ASP.NET server (Rfc2898DeriveBytes = PBKDF2-HMAC-SHA1).
// Run: dotnet run vectors.cs > vectors.json
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

#pragma warning disable SYSLIB0041, SYSLIB0060
static byte[] Pbkdf2(string password, byte[] salt, int iterations, int size)
{
    using var d = new Rfc2898DeriveBytes(password ?? string.Empty, salt);
    d.IterationCount = iterations;
    return d.GetBytes(size);
}

var username = "TestUser";
var password = "pässwörd";
var hashSalt = Convert.FromBase64String("AQIDBAUGBwg=");
var hash = Pbkdf2(password, hashSalt, 5000, 24);
var legacyHash = $"pbkdf2:5000:{Convert.ToBase64String(hashSalt)}:{Convert.ToBase64String(hash)}";
var encryptPass = Convert.ToBase64String(Pbkdf2(username, Encoding.UTF8.GetBytes(password), 5000, 64));
var encryptPassLower = Convert.ToBase64String(Pbkdf2(username.ToLowerInvariant(), Encoding.UTF8.GetBytes(password), 5000, 64));
var keySalt = "AAECAwQFBgcICQoLDA0ODw==";
var key = Pbkdf2(encryptPass, Convert.FromBase64String(keySalt), 5000, 32);

using var aes = Aes.Create();
aes.Key = key;
aes.IV = Encoding.UTF8.GetBytes("d6c6b426090a5ae9");
aes.Mode = CipherMode.CBC;
aes.Padding = PaddingMode.PKCS7;
var plaintext = "Hallo Welt äöü 😀\nZweite Zeile.";
var cipher = aes.CreateEncryptor().TransformFinalBlock(Encoding.UTF8.GetBytes(plaintext), 0, Encoding.UTF8.GetByteCount(plaintext));

Console.WriteLine(JsonSerializer.Serialize(new
{
    username,
    password,
    legacyHash,
    encryptPass,
    encryptPassLowercaseUsername = encryptPassLower,
    legacyKeyParams = $"pbkdf2:5000:{keySalt}:32",
    legacyKeySalt = keySalt,
    legacyKey = Convert.ToBase64String(key),
    plaintext,
    ciphertext = Convert.ToBase64String(cipher),
}, new JsonSerializerOptions { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
