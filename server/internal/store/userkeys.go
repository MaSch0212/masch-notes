package store

import (
	"context"
	"database/sql"

	"github.com/MaSch0212/masch-notes/server/internal/db"
)

const (
	KeyStatusMigrating = "migrating"
	KeyStatusActive    = "active"

	legacyKeySettingID = -1
)

type UserKey struct {
	UserID          int64
	KdfSalt         []byte
	KdfIterations   int
	WrappedKey      []byte
	Status          string
	PendingAuthHash string
}

func (s *Store) GetUserKey(ctx context.Context, userID int64) (UserKey, error) {
	var k UserKey
	var pending sql.NullString
	err := s.q().QueryRowContext(ctx,
		`SELECT [userid], [kdfsalt], [kdfiterations], [wrappedkey], [status], [pendingauthhash]
		 FROM [userkeys] WHERE [userid] = ?`, userID).
		Scan(&k.UserID, &k.KdfSalt, &k.KdfIterations, &k.WrappedKey, &k.Status, &pending)
	k.PendingAuthHash = pending.String
	return k, mapNoRows(err)
}

func (s *Store) UpsertUserKey(ctx context.Context, k UserKey) error {
	var pending any
	if k.PendingAuthHash != "" {
		pending = k.PendingAuthHash
	}
	_, err := s.q().ExecContext(ctx,
		`INSERT INTO [userkeys] ([userid], [kdfsalt], [kdfiterations], [wrappedkey], [status], [updatedat], [pendingauthhash])
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT([userid]) DO UPDATE SET
		   [kdfsalt] = excluded.[kdfsalt], [kdfiterations] = excluded.[kdfiterations],
		   [wrappedkey] = excluded.[wrappedkey], [status] = excluded.[status],
		   [updatedat] = excluded.[updatedat], [pendingauthhash] = excluded.[pendingauthhash]`,
		k.UserID, k.KdfSalt, k.KdfIterations, k.WrappedKey, k.Status, db.FormatTimestamp(s.now()), pending)
	return err
}

// LegacyKeyParams returns the legacy key parameter string (settings row -1).
func (s *Store) LegacyKeyParams(ctx context.Context, userID int64) (string, error) {
	var v string
	err := s.q().QueryRowContext(ctx,
		`SELECT [value] FROM [settings] WHERE [userid] = ? AND [settingid] = ?`, userID, legacyKeySettingID).Scan(&v)
	return v, mapNoRows(err)
}

func (s *Store) DeleteLegacyKeyParams(ctx context.Context, userID int64) error {
	_, err := s.q().ExecContext(ctx,
		`DELETE FROM [settings] WHERE [userid] = ? AND [settingid] = ?`, userID, legacyKeySettingID)
	return err
}
