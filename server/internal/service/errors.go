// Package service implements the generated API service interfaces over the store.
package service

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// Error is a service failure that is reported to the client as {code, message}.
type Error struct {
	Status        int
	Code, Message string
}

func (e Error) Error() string { return fmt.Sprintf("%d %s: %s", e.Status, e.Code, e.Message) }

func newError(status int, code, message string) *Error {
	return &Error{Status: status, Code: code, Message: message}
}

func badRequest(code, message string) *Error { return newError(http.StatusBadRequest, code, message) }

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// WriteError is the error handler of the generated routes.
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
	var se *Error
	var re *api.RequestError
	switch {
	case errors.As(err, &se):
		writeJSON(w, se.Status, api.Error{Code: se.Code, Message: se.Message})
	case errors.Is(err, store.ErrNotFound):
		writeJSON(w, http.StatusNotFound, api.Error{Code: "notFound", Message: "not found"})
	case errors.Is(err, store.ErrConflict):
		writeJSON(w, http.StatusConflict, api.Error{Code: "conflict", Message: "conflict"})
	case errors.As(err, &re):
		writeJSON(w, re.StatusCode, api.Error{Code: "invalidRequest", Message: re.Error()})
	default:
		slog.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "error", err)
		writeJSON(w, http.StatusInternalServerError, api.Error{Code: "internal", Message: "internal server error"})
	}
}
