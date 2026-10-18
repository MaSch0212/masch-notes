package service

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/auth"
	"github.com/MaSch0212/masch-notes/server/internal/config"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// AuthService implements api.AuthService.
type AuthService struct {
	Store  *store.Store
	Tokens *auth.Tokens
	Cfg    config.Config
	// Secret derives the fake key parameters returned for unknown usernames.
	Secret []byte
}

var _ api.AuthService = (*AuthService)(nil)

func invalidCredentials() *Error {
	return newError(http.StatusUnauthorized, "invalidCredentials", "invalid username or password")
}

func (s *AuthService) GetConfig(context.Context, api.GetConfigRequest) (api.GetConfigResponse, error) {
	return api.GetConfig200Response{Body: api.AppConfig{
		RegistrationEnabled: s.Cfg.AllowRegistration,
		AiEnabled:           s.Cfg.AI.Enabled(),
	}}, nil
}

func (s *AuthService) Prelogin(ctx context.Context, req api.PreloginRequestObject) (api.PreloginResponseObject, error) {
	name := strings.TrimSpace(req.Body.Username)
	acc, err := s.Store.AccountByUsername(ctx, name)
	if errors.Is(err, store.ErrNotFound) {
		it := minKdfIterations
		return api.Prelogin200Response{Body: api.PreloginResponse{
			Scheme: api.KeySchemeV2, KdfSalt: auth.FakeKdfSalt(s.Secret, name), KdfIterations: &it,
		}}, nil
	}
	if err != nil {
		return nil, err
	}
	k, active, err := activeKey(ctx, s.Store, acc.UserID)
	if err != nil {
		return nil, err
	}
	if !active {
		return api.Prelogin200Response{Body: api.PreloginResponse{Scheme: api.KeySchemeLegacy}}, nil
	}
	it := k.KdfIterations
	return api.Prelogin200Response{Body: api.PreloginResponse{
		Scheme: api.KeySchemeV2, KdfSalt: k.KdfSalt, KdfIterations: &it,
	}}, nil
}

func (s *AuthService) loginResponse(ctx context.Context, userID int64, stay bool) (api.LoginResponse, error) {
	u, err := s.Store.UserByID(ctx, userID)
	if err != nil {
		return api.LoginResponse{}, err
	}
	token, exp, err := s.Tokens.Issue(userID, stay)
	if err != nil {
		return api.LoginResponse{}, err
	}
	return api.LoginResponse{Token: token, ExpiresAt: exp, User: toAPIUser(u)}, nil
}

func (s *AuthService) Login(ctx context.Context, req api.LoginRequestObject) (api.LoginResponseObject, error) {
	b := req.Body
	acc, err := s.Store.AccountByUsername(ctx, strings.TrimSpace(b.Username))
	if errors.Is(err, store.ErrNotFound) {
		return nil, invalidCredentials()
	}
	if err != nil {
		return nil, err
	}
	k, active, err := activeKey(ctx, s.Store, acc.UserID)
	if err != nil {
		return nil, err
	}
	if active {
		if len(b.AuthKey) == 0 || b.Password != nil || !auth.VerifyAuthKey(b.AuthKey, acc.PasswordHash) {
			return nil, invalidCredentials()
		}
	} else if b.Password == nil || len(b.AuthKey) != 0 || !auth.VerifyLegacyHash(*b.Password, acc.PasswordHash) {
		return nil, invalidCredentials()
	}
	resp, err := s.loginResponse(ctx, acc.UserID, b.StayLoggedIn)
	if err != nil {
		return nil, err
	}
	if active {
		resp.Scheme, resp.WrappedKey = api.KeySchemeV2, k.WrappedKey
		return api.Login200Response{Body: resp}, nil
	}
	info, err := migrationInfo(ctx, s.Store, acc.UserID)
	if err != nil {
		return nil, err
	}
	resp.Scheme, resp.Migration = api.KeySchemeLegacy, &info
	return api.Login200Response{Body: resp}, nil
}

func (s *AuthService) Register(ctx context.Context, req api.RegisterRequestObject) (api.RegisterResponse, error) {
	b := req.Body
	if !s.Cfg.AllowRegistration {
		return nil, newError(http.StatusForbidden, "registrationDisabled", "registration is disabled")
	}
	name := strings.TrimSpace(b.Username)
	if name == "" {
		return nil, badRequest("invalidRequest", "username is required")
	}
	if e := validateKeyMaterial(b.AuthKey, b.KdfSalt, b.KdfIterations, b.WrappedKey); e != nil {
		return nil, e
	}
	hash, err := auth.HashAuthKey(b.AuthKey)
	if err != nil {
		return nil, err
	}
	var id int64
	err = s.Store.Tx(ctx, func(tx *store.Store) error {
		var err error
		id, err = tx.CreateUser(ctx, name, hash, store.User{GivenName: b.GivenName, Surname: b.Surname, Email: b.Email})
		if err != nil {
			return err
		}
		return tx.UpsertUserKey(ctx, store.UserKey{
			UserID: id, KdfSalt: b.KdfSalt, KdfIterations: b.KdfIterations, WrappedKey: b.WrappedKey,
			Status: store.KeyStatusActive,
		})
	})
	if errors.Is(err, store.ErrConflict) {
		return nil, newError(http.StatusConflict, "usernameTaken", "username is already taken")
	}
	if err != nil {
		return nil, err
	}
	resp, err := s.loginResponse(ctx, id, false)
	if err != nil {
		return nil, err
	}
	resp.Scheme, resp.WrappedKey = api.KeySchemeV2, b.WrappedKey
	return api.Register201Response{Body: resp}, nil
}

func (s *AuthService) CheckToken(context.Context, api.CheckTokenRequest) (api.CheckTokenResponse, error) {
	return api.CheckToken204Response{}, nil
}

func (s *AuthService) ChangePassword(ctx context.Context, req api.ChangePasswordRequestObject) (api.ChangePasswordResponse, error) {
	id, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	b := req.Body
	_, active, err := activeKey(ctx, s.Store, id)
	if err != nil {
		return nil, err
	}
	if !active {
		return nil, newError(http.StatusConflict, "migrationRequired", "the encryption migration must be completed first")
	}
	if e := validateKeyMaterial(b.NewAuthKey, b.KdfSalt, b.KdfIterations, b.WrappedKey); e != nil {
		return nil, e
	}
	u, err := s.Store.UserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	acc, err := s.Store.AccountByUsername(ctx, u.Username)
	if err != nil {
		return nil, err
	}
	if len(b.OldAuthKey) == 0 || !auth.VerifyAuthKey(b.OldAuthKey, acc.PasswordHash) {
		return nil, newError(http.StatusUnauthorized, "wrongPassword", "the current password is wrong")
	}
	hash, err := auth.HashAuthKey(b.NewAuthKey)
	if err != nil {
		return nil, err
	}
	err = s.Store.Tx(ctx, func(tx *store.Store) error {
		if err := tx.SetPasswordHash(ctx, id, hash); err != nil {
			return err
		}
		return tx.UpsertUserKey(ctx, store.UserKey{
			UserID: id, KdfSalt: b.KdfSalt, KdfIterations: b.KdfIterations, WrappedKey: b.WrappedKey,
			Status: store.KeyStatusActive,
		})
	})
	if err != nil {
		return nil, err
	}
	return api.ChangePassword204Response{}, nil
}
