# Build stage
FROM golang:1.25.7-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git build-base

# Copy module manifest and download dependencies
COPY go.mod go.sum ./
ENV GOPROXY=https://goproxy.io,direct
RUN go mod download -x

# Copy source code and build statically linked binary
COPY . .
RUN go mod tidy
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o yourmsgr .

# Run stage
FROM alpine:latest
RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/yourmsgr /app/yourmsgr
COPY --from=builder /app/db/migrations /app/db/migrations

EXPOSE 3000

CMD ["./yourmsgr"]
