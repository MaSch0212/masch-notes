# syntax=docker/dockerfile:1

# Client: build the SolidJS app with Vite.
FROM --platform=$BUILDPLATFORM node:24-alpine AS client
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client/package.json ./client/
COPY tools/codegen/package.json ./tools/codegen/
RUN pnpm install --frozen-lockfile --filter client...
COPY client/ ./client/
RUN pnpm --filter client build

# Server: embed the client build and compile a static binary for the target platform.
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS server
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=client /src/client/dist/ ./internal/web/dist/
RUN mkdir -p /out && \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/maschnotes ./cmd/maschnotes

# Final image. Runs as root like the previous image so port 80 and existing /data permissions keep working.
FROM alpine:3
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=server /out/maschnotes /app/maschnotes
ENV DATA_DIR=/data PORT=80
VOLUME /data
EXPOSE 80
ENTRYPOINT ["/app/maschnotes"]
