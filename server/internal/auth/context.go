package auth

import "context"

type userIDKey struct{}

// WithUserID returns a context carrying the authenticated user id.
func WithUserID(ctx context.Context, id int64) context.Context {
	return context.WithValue(ctx, userIDKey{}, id)
}

// UserID returns the authenticated user id stored by the middleware.
func UserID(ctx context.Context) (int64, bool) {
	id, ok := ctx.Value(userIDKey{}).(int64)
	return id, ok
}
