package store

import (
	"context"
	"fmt"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/db"
)

type APIKey struct {
	ID        int64
	Name      string
	CreatedAt time.Time
}

func (s *Store) ListAPIKeys(ctx context.Context, userID int64) ([]APIKey, error) {
	rows, err := s.q().QueryContext(ctx,
		`SELECT [id], [name], CAST([timestamp] AS TEXT) FROM [apikeys] WHERE [userid] = ? ORDER BY [id]`, userID)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []APIKey{}
	for rows.Next() {
		var k APIKey
		var ts string
		if err := rows.Scan(&k.ID, &k.Name, &ts); err != nil {
			return nil, err
		}
		if k.CreatedAt, err = db.ParseTime(ts); err != nil {
			return nil, fmt.Errorf("api key %d: %w", k.ID, err)
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// CreateAPIKey stores a key. The id is assigned explicitly because the schema of
// fresh installs declares it as INT (not a rowid alias).
func (s *Store) CreateAPIKey(ctx context.Context, userID int64, key, name string, at time.Time) (APIKey, error) {
	var id int64
	err := s.q().QueryRowContext(ctx,
		`INSERT INTO [apikeys] ([id], [key], [name], [userid], [timestamp])
		 VALUES ((SELECT COALESCE(MAX([id]), 0) + 1 FROM [apikeys]), ?, ?, ?, ?) RETURNING [id]`,
		key, name, userID, db.FormatTimestamp(at)).Scan(&id)
	if err != nil {
		return APIKey{}, err
	}
	return APIKey{ID: id, Name: name, CreatedAt: at.UTC()}, nil
}

// DeleteAPIKey removes a key owned by userID; ErrNotFound otherwise.
func (s *Store) DeleteAPIKey(ctx context.Context, userID, id int64) error {
	return affected(s.q().ExecContext(ctx,
		`DELETE FROM [apikeys] WHERE [id] = ? AND [userid] = ?`, id, userID))
}

func (s *Store) UserIDByAPIKey(ctx context.Context, key string) (int64, error) {
	var id int64
	err := s.q().QueryRowContext(ctx, `SELECT [userid] FROM [apikeys] WHERE [key] = ?`, key).Scan(&id)
	return id, mapNoRows(err)
}
