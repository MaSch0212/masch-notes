FROM mcr.microsoft.com/dotnet/aspnet:5.0 AS base
WORKDIR /app
EXPOSE 80
EXPOSE 443

FROM mcr.microsoft.com/dotnet/sdk:5.0 AS build-server
WORKDIR /src
COPY src/MaSchNotes.Server .
RUN dotnet publish MaSchNotes.Server.csproj -c Release -o /app/publish

FROM node:16 AS pre-build-client
WORKDIR /src
COPY src/MaSchNotes.Client/package.json src/MaSchNotes.Client/yarn.lock .
RUN yarn

FROM pre-build-client AS build-client
COPY src/MaSchNotes.Client .
RUN yarn build-prod --output-path /app/publish

FROM base AS final
WORKDIR /app
COPY --from=build-server /app/publish .
COPY --from=build-client /app/publish ./wwwroot/
ENTRYPOINT dotnet MaSchNotes.dll