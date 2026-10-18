package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/db"
)

type Rating struct {
	Date  time.Time
	Value int
}

// ListRatings returns the user's ratings for the inclusive day range.
func (s *Store) ListRatings(ctx context.Context, userID int64, from, to time.Time) ([]Rating, error) {
	rows, err := s.q().QueryContext(ctx,
		`SELECT CAST([date] AS TEXT), [rating] FROM [dayratings]
		 WHERE [userid] = ? AND substr([date], 1, 10) >= ? AND substr([date], 1, 10) <= ?
		 ORDER BY substr([date], 1, 10)`, userID, dayString(from), dayString(to))
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := []Rating{}
	for rows.Next() {
		var ds string
		var r Rating
		if err := rows.Scan(&ds, &r.Value); err != nil {
			return nil, err
		}
		if r.Date, err = db.ParseTime(ds); err != nil {
			return nil, fmt.Errorf("rating: %w", err)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// SetRating stores the rating for a day, replacing any row for that day regardless of its date format.
func (s *Store) SetRating(ctx context.Context, userID int64, date time.Time, value int) error {
	return s.Tx(ctx, func(s *Store) error {
		if err := s.ClearRating(ctx, userID, date); err != nil {
			return err
		}
		_, err := s.q().ExecContext(ctx,
			`INSERT OR REPLACE INTO [dayratings] ([userid], [date], [rating]) VALUES (?, ?, ?)`,
			userID, db.FormatDate(date), value)
		return err
	})
}

// ClearRating removes the rating of a day; no error if there is none.
func (s *Store) ClearRating(ctx context.Context, userID int64, date time.Time) error {
	_, err := s.q().ExecContext(ctx,
		`DELETE FROM [dayratings] WHERE [userid] = ? AND substr([date], 1, 10) = ?`, userID, dayString(date))
	return err
}

// GetRating returns the rating of a day or nil if none is set.
func (s *Store) GetRating(ctx context.Context, userID int64, date time.Time) (*int, error) {
	var v int
	err := s.q().QueryRowContext(ctx,
		`SELECT [rating] FROM [dayratings] WHERE [userid] = ? AND substr([date], 1, 10) = ? LIMIT 1`,
		userID, dayString(date)).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil //nolint:nilnil // nil means not rated
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}
