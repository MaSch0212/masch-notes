package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

const (
	minKdfIterations = 600000
	kdfSaltLen       = 16
)

func validateKeyMaterial(authKey, salt []byte, iterations int, wrapped []byte) *Error {
	switch {
	case len(authKey) == 0:
		return badRequest("invalidRequest", "authKey is required")
	case len(wrapped) == 0:
		return badRequest("invalidRequest", "wrappedKey is required")
	case len(salt) != kdfSaltLen:
		return badRequest("invalidRequest", "kdfSalt must be 16 bytes")
	case iterations < minKdfIterations:
		return badRequest("invalidRequest", "kdfIterations is too low")
	}
	return nil
}

// userID returns the authenticated user of the request.
func userID(ctx context.Context) (int64, error) {
	id, ok := auth.UserID(ctx)
	if !ok {
		return 0, newError(401, "unauthorized", "authentication required")
	}
	return id, nil
}

// activeKey returns the user's key row and whether it is active.
func activeKey(ctx context.Context, st *store.Store, id int64) (store.UserKey, bool, error) {
	k, err := st.GetUserKey(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return store.UserKey{}, false, nil
	}
	if err != nil {
		return store.UserKey{}, false, err
	}
	return k, k.Status == store.KeyStatusActive, nil
}

// migrationInfo describes the legacy encryption migration state of a user.
// "done" means an active v2 key, "migrating" a started migration, "none" a legacy user.
func migrationInfo(ctx context.Context, st *store.Store, id int64) (api.MigrationInfo, error) {
	k, err := st.GetUserKey(ctx, id)
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		return api.MigrationInfo{}, err
	}
	hasRow := err == nil
	if hasRow && k.Status == store.KeyStatusActive {
		return api.MigrationInfo{Status: api.MigrationStatusDone}, nil
	}
	info := api.MigrationInfo{Status: api.MigrationStatusNone}
	if hasRow {
		iter := k.KdfIterations
		info.Status = api.MigrationStatusMigrating
		info.KdfSalt, info.KdfIterations, info.WrappedKey = k.KdfSalt, &iter, k.WrappedKey
	}
	params, err := st.LegacyKeyParams(ctx, id)
	switch {
	case errors.Is(err, store.ErrNotFound):
	case err != nil:
		return api.MigrationInfo{}, err
	default:
		if info.LegacySalt, err = auth.ParseLegacyKeyParams(params); err != nil {
			return api.MigrationInfo{}, fmt.Errorf("user %d: %w", id, err)
		}
	}
	if info.TotalEntries, info.MigratedEntries, err = st.MigrationCounts(ctx, id); err != nil {
		return api.MigrationInfo{}, err
	}
	return info, nil
}
