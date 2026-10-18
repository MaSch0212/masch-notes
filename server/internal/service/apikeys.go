package service

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// APIKeysService implements api.APIKeysService.
type APIKeysService struct {
	Store *store.Store
}

var _ api.APIKeysService = (*APIKeysService)(nil)

const (
	base62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
	apiKeyBytes    = 32
	// apiKeyChars is the number of base62 digits needed for 256 bits.
	apiKeyChars = 43
)

// newAPIKey returns 32 random bytes as a base62 string of fixed length.
func newAPIKey() (string, error) {
	raw := make([]byte, apiKeyBytes)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("generate api key: %w", err)
	}
	n := new(big.Int).SetBytes(raw)
	base, mod := big.NewInt(62), new(big.Int)
	out := make([]byte, apiKeyChars)
	for i := apiKeyChars - 1; i >= 0; i-- {
		n.DivMod(n, base, mod)
		out[i] = base62Alphabet[mod.Int64()]
	}
	return string(out), nil
}

func toAPIKey(k store.APIKey) api.APIKey {
	return api.APIKey{ID: k.ID, Name: k.Name, CreatedAt: k.CreatedAt}
}

func (s *APIKeysService) ListAPIKeys(ctx context.Context, _ api.ListAPIKeysRequest) (api.ListAPIKeysResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	list, err := s.Store.ListAPIKeys(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]api.APIKey, 0, len(list))
	for _, k := range list {
		out = append(out, toAPIKey(k))
	}
	return api.ListAPIKeys200Response{Body: out}, nil
}

func (s *APIKeysService) CreateAPIKey(ctx context.Context, req api.CreateAPIKeyRequest) (api.CreateAPIKeyResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Body.Name)
	if name == "" {
		return nil, badRequest("nameRequired", "name is required")
	}
	for range 3 {
		key, err := newAPIKey()
		if err != nil {
			return nil, err
		}
		if _, err := s.Store.UserIDByAPIKey(ctx, key); err == nil {
			continue // collision, practically impossible
		} else if !errors.Is(err, store.ErrNotFound) {
			return nil, err
		}
		created, err := s.Store.CreateAPIKey(ctx, uid, key, name, time.Now())
		if err != nil {
			return nil, err
		}
		return api.CreateAPIKey201Response{Body: api.CreatedAPIKey{Key: key, APIKey: toAPIKey(created)}}, nil
	}
	return nil, errors.New("could not generate a unique api key")
}

func (s *APIKeysService) DeleteAPIKey(ctx context.Context, req api.DeleteAPIKeyRequest) (api.DeleteAPIKeyResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if err := s.Store.DeleteAPIKey(ctx, uid, req.KeyID); err != nil {
		return nil, err
	}
	return api.DeleteAPIKey204Response{}, nil
}
