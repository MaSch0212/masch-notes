using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using MaSch.Notes.Common;
using MaSch.Notes.Repositories;
using MaSch.Notes.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.HttpsPolicy;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SpaServices.AngularCli;
using Microsoft.AspNetCore.SpaServices.StaticFiles;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Primitives;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using Newtonsoft.Json.Linq;

namespace MaSch.Notes
{
    public class Startup
    {
        public Startup(IConfiguration configuration)
        {
            Configuration = configuration;
        }

        public IConfiguration Configuration { get; }

        // This method gets called by the runtime. Use this method to add services to the container.
        public void ConfigureServices(IServiceCollection services)
        {
            services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
            {
                var serverSecret = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(Configuration["JWT:key"]));
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = serverSecret,
                    ValidIssuer = Configuration["JWT:Issuer"],
                    ValidAudience = Configuration["JWT:Audience"]
                };
            });

            services.AddControllers().AddNewtonsoftJson();

            // In production, the Angular files will be served from this directory
            services.AddSpaStaticFiles(configuration =>
            {
                configuration.RootPath = "wwwroot";
            });

            services.AddSingleton<IDatabaseService, DatabaseService>();

            services.AddSingleton<IUserRepository, UserRepository>();
            services.AddSingleton<ISettingsRepository, SettingsRepository>();
            services.AddSingleton<INotebookRepository, NotebookRepository>();
            services.AddSingleton<IDayRatingRepository, DayRatingRepository>();

            services.AddSingleton<ISessionService, SessionService>();
            services.AddSingleton<IHashingService, HashingService>();
            services.AddSingleton<ISettingsService, SettingsService>();
            services.AddSingleton<INotebookService, NotebookService>();
            services.AddSingleton<IDayRatingService, DayRatingService>();

            services.AddSwaggerGen(c =>
            {
                c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
                {
                    Name = "Authorization",
                    Type = SecuritySchemeType.ApiKey,
                    Scheme = "Bearer",
                    BearerFormat = "JWT",
                    In = ParameterLocation.Header,
                    Description = "JWT Authorization header using the Bearer scheme."
                });

                c.AddSecurityRequirement(new OpenApiSecurityRequirement
                {
                    {
                        new OpenApiSecurityScheme
                        {
                            Reference = new OpenApiReference
                            {
                                Type = ReferenceType.SecurityScheme,
                                Id = "Bearer"
                            }
                        },
                        Array.Empty<string>()
                    }
                });
            });
        }

        // This method gets called by the runtime. Use this method to configure the HTTP request pipeline.
        public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
        {
            app.Use(async (context, next) => await ApiKeyMiddleware.Invoke(context, next));

            if (env.IsDevelopment())
            {
                app.UseDeveloperExceptionPage();
            }

            app.UseHttpsRedirection();

            if ((Configuration["path-base"] ?? Configuration["PathBase"]) is string pathBase)
                app.UsePathBase(pathBase);

            app.Use(async (context, next) =>
            {
                bool isMatch = false;
                var originalPath = context.Request.Path;
                var originalPathBase = context.Request.PathBase;

                if (context.Request.Headers.TryGetValue("X-Forwarded-Path", out StringValues values) && values.Count > 0)
                {
                    foreach (var path in values)
                    {
                        if (context.Request.Path.StartsWithSegments("/" + path.Trim('/'), out var matched, out var remaining))
                        {
                            isMatch = true;
                            context.Request.Path = remaining;
                            context.Request.PathBase = context.Request.PathBase.Add(matched);
                            break;
                        }
                    }
                }

                try
                {
                    await next();
                }
                finally
                {
                    if (isMatch)
                    {
                        context.Request.Path = originalPath;
                        context.Request.PathBase = originalPathBase;
                    }
                }
            });
            app.UseForwardedHeaders();

            app.Use(async (context, next) =>
            {
                var body = context.Response.Body;
                using var newBody = new MemoryStream();
                context.Response.Body = newBody;

                await next();

                context.Response.Body = body;
                newBody.Seek(0, SeekOrigin.Begin);
                var pathBase = context.Request.PathBase.Value.TrimEnd('/') + "/";
                if (context.Response.ContentType == "text/html")
                {
                    using var streamReader = new StreamReader(newBody);
                    var html = await streamReader.ReadToEndAsync();
                    var baseTagMatch = Regex.Match(html, @"<base href=""(?<PathBase>[^""]+)""\s*\/?>");
                    if (baseTagMatch.Success)
                    {
                        var pathBaseGroup = baseTagMatch.Groups["PathBase"];
                        html = string.Concat(html[..pathBaseGroup.Index], pathBase, html[(pathBaseGroup.Index + pathBaseGroup.Value.Length)..]);
                    }

                    context.Response.ContentLength = null;
                    await using (var sw = new StreamWriter(context.Response.Body))
                    {
                        await sw.WriteAsync(html);
                    }
                }
                else if (context.Request.Path.Value.EndsWith("manifest.webmanifest.json"))
                {
                    using var streamReader = new StreamReader(newBody);
                    var json = await streamReader.ReadToEndAsync();
                    var jObj = JObject.Parse(json);
                    jObj["scope"] = pathBase;
                    jObj["start_url"] = pathBase;
                    context.Response.ContentLength = null;
                    await using (var sw = new StreamWriter(context.Response.Body))
                    {
                        await sw.WriteAsync(jObj.ToString());
                    }
                }
                else
                {
                    await newBody.CopyToAsync(context.Response.Body);
                }
            });

            app.UseStaticFiles();
            if (!env.IsDevelopment())
                app.UseSpaStaticFiles();

            app.UseSwagger();
            app.UseSwaggerUI(c =>
            {
                c.SwaggerEndpoint("/swagger/v1/swagger.json", "My API v1");
            });

            app.UseRouting();

            app.UseAuthentication();
            app.UseAuthorization();

            app.UseEndpoints(endpoints =>
            {
                endpoints.MapControllerRoute(
                    name: "default",
                    pattern: "{controller}/{action=Index}/{id?}");
            });

            app.UseSpa(spa =>
            {
                // To learn more about options for serving an Angular SPA from ASP.NET Core,
                // see https://go.microsoft.com/fwlink/?linkid=864501

                spa.Options.SourcePath = "../MaSchNotes.Client";

                if (env.IsDevelopment())
                {
                    spa.UseAngularCliServer(npmScript: "start");
                }
            });
        }
    }
}
