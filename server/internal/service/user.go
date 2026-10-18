package service

import (
	"context"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// UserService implements api.UserService.
type UserService struct {
	Store *store.Store
}

var _ api.UserService = (*UserService)(nil)

func toAPIUser(u store.User) api.User {
	return api.User{ID: u.ID, Username: u.Username, GivenName: u.GivenName, Surname: u.Surname, Email: u.Email}
}

func (s *UserService) GetUser(ctx context.Context, _ api.GetUserRequest) (api.GetUserResponse, error) {
	id, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	u, err := s.Store.UserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return api.GetUser200Response{Body: toAPIUser(u)}, nil
}

func (s *UserService) UpdateUser(ctx context.Context, req api.UpdateUserRequestObject) (api.UpdateUserResponse, error) {
	id, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	b := req.Body
	if err := s.Store.UpdateUser(ctx, store.User{ID: id, GivenName: b.GivenName, Surname: b.Surname, Email: b.Email}); err != nil {
		return nil, err
	}
	u, err := s.Store.UserByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return api.UpdateUser200Response{Body: toAPIUser(u)}, nil
}
