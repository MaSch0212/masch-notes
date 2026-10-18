package service

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// CryptoService implements api.CryptoService: the resumable migration from the
// legacy encryption to the v2 scheme.
type CryptoService struct {
	Store *store.Store
}

var _ api.CryptoService = (*CryptoService)(nil)

const (
	maxMigrationBatch   = 200
	defaultPendingLimit = 50
	// minV2Content is the size of a 12-byte IV plus a 16-byte GCM tag.
	minV2Content = 28
)

func errNotStarted() *Error {
	return newError(http.StatusConflict, "migrationNotStarted", "the migration has not been started")
}

func errAlreadyMigrated() *Error {
	return newError(http.StatusConflict, "alreadyMigrated", "the account is already migrated")
}

// migratingKey returns the user's key row, which must be in the migrating state.
func (s *CryptoService) migratingKey(ctx context.Context, st *store.Store, id int64) (store.UserKey, error) {
	k, err := st.GetUserKey(ctx, id)
	if errors.Is(err, store.ErrNotFound) {
		return store.UserKey{}, errNotStarted()
	}
	if err != nil {
		return store.UserKey{}, err
	}
	if k.Status == store.KeyStatusActive {
		return store.UserKey{}, errAlreadyMigrated()
	}
	return k, nil
}

func (s *CryptoService) GetMigration(ctx context.Context, _ api.GetMigrationRequest) (api.GetMigrationResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	info, err := migrationInfo(ctx, s.Store, uid)
	if err != nil {
		return nil, err
	}
	return api.GetMigration200Response{Body: info}, nil
}

func (s *CryptoService) StartMigration(ctx context.Context, req api.StartMigrationRequestObject) (api.StartMigrationResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	b := req.Body
	_, err = s.migratingKey(ctx, s.Store, uid)
	var se *Error
	switch {
	case err == nil:
		// resume: the existing row stays unchanged
	case errors.As(err, &se) && se.Code == "migrationNotStarted":
		// Validate and hash before the transaction: argon2 is expensive.
		if e := validateKeyMaterial(b.AuthKey, b.KdfSalt, b.KdfIterations, b.WrappedKey); e != nil {
			return nil, e
		}
		hash, err := auth.HashAuthKey(b.AuthKey)
		if err != nil {
			return nil, err
		}
		err = s.Store.Tx(ctx, func(tx *store.Store) error {
			if _, err := tx.GetUserKey(ctx, uid); err == nil {
				return nil // started concurrently
			} else if !errors.Is(err, store.ErrNotFound) {
				return err
			}
			return tx.UpsertUserKey(ctx, store.UserKey{
				UserID: uid, KdfSalt: b.KdfSalt, KdfIterations: b.KdfIterations, WrappedKey: b.WrappedKey,
				Status: store.KeyStatusMigrating, PendingAuthHash: hash,
			})
		})
		if err != nil {
			return nil, err
		}
	default:
		return nil, err
	}
	info, err := migrationInfo(ctx, s.Store, uid)
	if err != nil {
		return nil, err
	}
	return api.StartMigration200Response{Body: info}, nil
}

func (s *CryptoService) ListPendingEntries(ctx context.Context, req api.ListPendingEntriesRequest) (api.ListPendingEntriesResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.migratingKey(ctx, s.Store, uid); err != nil {
		return nil, err
	}
	limit := defaultPendingLimit
	if req.Limit != nil {
		limit = min(max(*req.Limit, 1), maxMigrationBatch)
	}
	list, err := s.Store.PendingEntries(ctx, uid, limit)
	if err != nil {
		return nil, err
	}
	out := make([]api.PendingEntry, 0, len(list))
	for _, p := range list {
		pe := api.PendingEntry{ID: p.ID, NotebookID: p.NotebookID, NotebookName: p.NotebookName, Content: p.Content}
		if p.Date != nil {
			d := p.Date.Format(time.DateOnly)
			pe.Date = &d
		}
		out = append(out, pe)
	}
	return api.ListPendingEntries200Response{Body: out}, nil
}

func (s *CryptoService) UploadMigratedEntries(ctx context.Context, req api.UploadMigratedEntriesRequest) (api.UploadMigratedEntriesResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.migratingKey(ctx, s.Store, uid); err != nil {
		return nil, err
	}
	if len(req.Body) > maxMigrationBatch {
		return nil, badRequest("tooManyEntries", "at most 200 entries per request")
	}
	items := make(map[int64][]byte, len(req.Body))
	for _, it := range req.Body {
		if len(it.Content) < minV2Content {
			return nil, badRequest("invalidContent", "content is too short to be encrypted data")
		}
		items[it.ID] = it.Content
	}
	if err := s.Store.SetContentV2(ctx, uid, items); err != nil {
		return nil, err
	}
	return api.UploadMigratedEntries204Response{}, nil
}

func (s *CryptoService) SkipEntries(ctx context.Context, req api.SkipEntriesRequestObject) (api.SkipEntriesResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.migratingKey(ctx, s.Store, uid); err != nil {
		return nil, err
	}
	if err := s.Store.SkipEntries(ctx, uid, req.Body.EntryIds); err != nil {
		return nil, err
	}
	return api.SkipEntries204Response{}, nil
}

func (s *CryptoService) CompleteMigration(ctx context.Context, _ api.CompleteMigrationRequest) (api.CompleteMigrationResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	err = s.Store.Tx(ctx, func(tx *store.Store) error {
		k, err := s.migratingKey(ctx, tx, uid)
		if err != nil {
			return err
		}
		if err := tx.FinalizeMigration(ctx, uid); err != nil {
			return err
		}
		if err := tx.SetPasswordHash(ctx, uid, k.PendingAuthHash); err != nil {
			return err
		}
		k.Status, k.PendingAuthHash = store.KeyStatusActive, ""
		if err := tx.UpsertUserKey(ctx, k); err != nil {
			return err
		}
		return tx.DeleteLegacyKeyParams(ctx, uid)
	})
	if errors.Is(err, store.ErrConflict) {
		return nil, newError(http.StatusConflict, "migrationIncomplete", "not all entries have been migrated")
	}
	if err != nil {
		return nil, err
	}
	return api.CompleteMigration204Response{}, nil
}
