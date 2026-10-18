package store

import (
	"context"
	"fmt"
)

type Account struct {
	UserID       int64
	Username     string
	PasswordHash string
}

type User struct {
	ID                                  int64
	Username, GivenName, Surname, Email string
}

// AccountByUsername looks an account up case-insensitively.
func (s *Store) AccountByUsername(ctx context.Context, name string) (Account, error) {
	var a Account
	err := s.q().QueryRowContext(ctx,
		`SELECT [userid], [name], [password] FROM [accounts] WHERE [name] = ? COLLATE NOCASE`, name).
		Scan(&a.UserID, &a.Username, &a.PasswordHash)
	return a, mapNoRows(err)
}

// UserByID returns the user; Username is the name of the user's first account.
func (s *Store) UserByID(ctx context.Context, id int64) (User, error) {
	var u User
	err := s.q().QueryRowContext(ctx,
		`SELECT [u].[id], [u].[givenname], [u].[surname], [u].[email],
		        COALESCE((SELECT [name] FROM [accounts] WHERE [userid] = [u].[id] LIMIT 1), '')
		 FROM [users] [u] WHERE [u].[id] = ?`, id).
		Scan(&u.ID, &u.GivenName, &u.Surname, &u.Email, &u.Username)
	return u, mapNoRows(err)
}

func (s *Store) UsernameTaken(ctx context.Context, name string) (bool, error) {
	var n int
	err := s.q().QueryRowContext(ctx,
		`SELECT COUNT(*) FROM [accounts] WHERE [name] = ? COLLATE NOCASE`, name).Scan(&n)
	return n > 0, err
}

// CreateUser inserts a user and its first account; ErrConflict if the name is taken.
func (s *Store) CreateUser(ctx context.Context, username, passwordHash string, u User) (int64, error) {
	var id int64
	err := s.Tx(ctx, func(s *Store) error {
		taken, err := s.UsernameTaken(ctx, username)
		if err != nil {
			return err
		}
		if taken {
			return ErrConflict
		}
		res, err := s.q().ExecContext(ctx,
			`INSERT INTO [users] ([givenname], [surname], [email]) VALUES (?, ?, ?)`,
			u.GivenName, u.Surname, u.Email)
		if err != nil {
			return fmt.Errorf("insert user: %w", err)
		}
		if id, err = res.LastInsertId(); err != nil {
			return err
		}
		if _, err := s.q().ExecContext(ctx,
			`INSERT INTO [accounts] ([name], [password], [userid]) VALUES (?, ?, ?)`,
			username, passwordHash, id); err != nil {
			return fmt.Errorf("insert account: %w", err)
		}
		return nil
	})
	return id, err
}

func (s *Store) UpdateUser(ctx context.Context, u User) error {
	return affected(s.q().ExecContext(ctx,
		`UPDATE [users] SET [givenname] = ?, [surname] = ?, [email] = ? WHERE [id] = ?`,
		u.GivenName, u.Surname, u.Email, u.ID))
}

func (s *Store) SetPasswordHash(ctx context.Context, userID int64, hash string) error {
	return affected(s.q().ExecContext(ctx,
		`UPDATE [accounts] SET [password] = ? WHERE [userid] = ?`, hash, userID))
}
