using System;
using System.Globalization;
using System.Linq;
using System.Net;
using System.Security.Claims;
using System.Security.Principal;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using MaSch.Notes.Models;
using MaSch.Notes.Services;

namespace MaSch.Notes.Common
{
    public static class ApiKeyMiddleware
    {
        public static async Task Invoke(HttpContext context, Func<Task> next)
        {
            if (context.Request.Path.StartsWithSegments(new PathString("/api")))
            {
                if (context.Request.Query.ContainsKey("apikey"))
                {
                    var headerKey = context.Request.Query["ApiKey"].FirstOrDefault();
                    await ValidateApiKey(context, next, headerKey);
                }
                else
                {
                    await next();
                }
            }
            else
            {
                await next();
            }
        }

        private static async Task ValidateApiKey(HttpContext context, Func<Task> next, string key)
        {
            User user = null;
            ValidationException exception = null;

            var sessionService = (ISessionService)context.RequestServices.GetService(typeof(ISessionService));

            try { user = sessionService.ValidateApiKey(key); }
            catch (ValidationException ex) { exception = ex; }

            if (user == null)
            {
                context.Response.StatusCode = exception?.StatusCode ?? StatusCodes.Status401Unauthorized;
                await context.Response.WriteAsync(exception?.Message ?? "Invalid API Key");
            }
            else
            {
                var identity = new GenericIdentity("API");
                identity.AddClaims(new[]
                {
                    new Claim(ClaimTypes.NameIdentifier, user.Id.ToString(CultureInfo.InvariantCulture)),
                    new Claim(ClaimTypes.GivenName, user.GivenName),
                    new Claim(ClaimTypes.Surname, user.Surname),
                    new Claim(ClaimTypes.Email, user.Email)
                });
                var principal = new GenericPrincipal(identity, new string[0]);
                context.User = principal;
                await next();
            }
        }
    }
}
