package store

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/db"
)

var ctx = context.Background()

func newTestStore(t *testing.T) *Store {
	t.Helper()
	p := filepath.Join(t.TempDir(), "maschnotes.db")
	d, err := db.Open(p)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = d.Close() })
	if err := db.Migrate(ctx, d, p, time.Now); err != nil {
		t.Fatal(err)
	}
	return New(d)
}

func seedUser(t *testing.T, s *Store, name string) int64 {
	t.Helper()
	id, err := s.CreateUser(ctx, name, "hash", User{GivenName: "G", Surname: "S", Email: name + "@example.com"})
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func seedNotebook(t *testing.T, s *Store, userID int64, diary bool) Notebook {
	t.Helper()
	nb, err := s.CreateNotebook(ctx, userID, "Notebook", diary)
	if err != nil {
		t.Fatal(err)
	}
	return nb
}

func str(s string) *string { return &s }

func day(y int, m time.Month, d int) time.Time { return time.Date(y, m, d, 0, 0, 0, 0, time.UTC) }

func TestTxRollback(t *testing.T) {
	s := newTestStore(t)
	boom := errors.New("boom")
	err := s.Tx(ctx, func(s *Store) error {
		if _, err := s.CreateUser(ctx, "rolled", "h", User{}); err != nil {
			return err
		}
		return boom
	})
	if !errors.Is(err, boom) {
		t.Fatalf("got %v", err)
	}
	if taken, _ := s.UsernameTaken(ctx, "rolled"); taken {
		t.Fatal("transaction was not rolled back")
	}
}

func TestAccountLookupCaseInsensitive(t *testing.T) {
	s := newTestStore(t)
	id := seedUser(t, s, "Alice")
	a, err := s.AccountByUsername(ctx, "aLiCe")
	if err != nil || a.UserID != id || a.Username != "Alice" || a.PasswordHash != "hash" {
		t.Fatalf("%+v %v", a, err)
	}
	if taken, _ := s.UsernameTaken(ctx, "ALICE"); !taken {
		t.Fatal("expected taken")
	}
	if _, err := s.CreateUser(ctx, "alice", "h", User{}); !errors.Is(err, ErrConflict) {
		t.Fatalf("got %v", err)
	}
	if _, err := s.AccountByUsername(ctx, "bob"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
	u, err := s.UserByID(ctx, id)
	if err != nil || u.Username != "Alice" || u.Email != "Alice@example.com" {
		t.Fatalf("%+v %v", u, err)
	}
}

func TestUpdateUserAndPassword(t *testing.T) {
	s := newTestStore(t)
	id := seedUser(t, s, "alice")
	if err := s.UpdateUser(ctx, User{ID: id, GivenName: "A", Surname: "B", Email: "x@y.z"}); err != nil {
		t.Fatal(err)
	}
	u, _ := s.UserByID(ctx, id)
	if u.GivenName != "A" || u.Surname != "B" || u.Email != "x@y.z" {
		t.Fatalf("%+v", u)
	}
	if err := s.SetPasswordHash(ctx, id, "new"); err != nil {
		t.Fatal(err)
	}
	a, _ := s.AccountByUsername(ctx, "alice")
	if a.PasswordHash != "new" {
		t.Fatal("password not updated")
	}
	if err := s.UpdateUser(ctx, User{ID: 999}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestNotebooks(t *testing.T) {
	s := newTestStore(t)
	u := seedUser(t, s, "alice")
	nb, err := s.CreateNotebook(ctx, u, "Diary", true)
	if err != nil || nb.ID == 0 || !nb.IsDiary {
		t.Fatalf("%+v %v", nb, err)
	}
	if err := s.RenameNotebook(ctx, nb.ID, "Journal"); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetNotebook(ctx, nb.ID)
	if err != nil || got.Name != "Journal" || got.UserID != u {
		t.Fatalf("%+v %v", got, err)
	}
	list, _ := s.ListNotebooks(ctx, u)
	if len(list) != 1 {
		t.Fatalf("%+v", list)
	}
	if err := s.DeleteNotebook(ctx, nb.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetNotebook(ctx, nb.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestEntryDatesBothFormats(t *testing.T) {
	s := newTestStore(t)
	u := seedUser(t, s, "alice")
	nb := seedNotebook(t, s, u, true)
	for i, d := range []string{"2023-10-22 00:00:00", "2023-10-23T00:00:00.0000000", "2023-10-25T00:00:00.0000000", "2023-11-01 00:00:00"} {
		if _, err := s.DB.Exec(`INSERT INTO notebookentries (notebookid, date, content) VALUES (?, ?, x'01')`, nb.ID, d); err != nil {
			t.Fatal(i, err)
		}
	}
	if _, err := s.DB.Exec(`INSERT INTO notebookentries (notebookid, date, content) VALUES (?, NULL, x'01')`, nb.ID); err != nil {
		t.Fatal(err)
	}
	all, err := s.ListEntries(ctx, nb.ID, nil, nil, false)
	if err != nil || len(all) != 5 {
		t.Fatalf("%d %v", len(all), err)
	}
	for _, e := range all {
		if e.Content != nil {
			t.Fatal("content should be omitted")
		}
	}
	from, to := day(2023, 10, 22), day(2023, 10, 25)
	got, err := s.ListEntries(ctx, nb.ID, &from, &to, true)
	if err != nil || len(got) != 3 {
		t.Fatalf("%d %v", len(got), err)
	}
	if got[0].Date == nil || got[0].Date.Day() != 22 || len(got[0].Content) != 1 {
		t.Fatalf("%+v", got[0])
	}
	e, err := s.EntryByDate(ctx, nb.ID, day(2023, 10, 22))
	if err != nil || e.ID != got[0].ID {
		t.Fatalf("%+v %v", e, err)
	}
	if _, err := s.EntryByDate(ctx, nb.ID, day(2000, 1, 1)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestCreateEntryCategoryUpsertAndCleanup(t *testing.T) {
	s := newTestStore(t)
	u := seedUser(t, s, "alice")
	nb := seedNotebook(t, s, u, false)
	d := day(2026, 10, 18)
	e1, err := s.CreateEntry(ctx, nb.ID, Entry{Name: str("a"), Category: str("Work"), Date: &d, Content: []byte{1}, EncVersion: 2})
	if err != nil {
		t.Fatal(err)
	}
	e2, err := s.CreateEntry(ctx, nb.ID, Entry{Name: str("b"), Category: str("Work"), Content: []byte{2}})
	if err != nil {
		t.Fatal(err)
	}
	cats, _ := s.ListCategories(ctx, nb.ID)
	if len(cats) != 1 || cats[0] != "Work" {
		t.Fatalf("%v", cats)
	}
	got, _ := s.GetEntry(ctx, e1.ID)
	if got.Category == nil || *got.Category != "Work" || got.EncVersion != 2 || got.Date == nil {
		t.Fatalf("%+v", got)
	}
	var raw string
	if err := s.DB.QueryRow(`SELECT CAST(date AS TEXT) FROM notebookentries WHERE id = ?`, e1.ID).Scan(&raw); err != nil || raw != "2026-10-18T00:00:00.0000000" {
		t.Fatalf("%q %v", raw, err)
	}
	if got, _ := s.GetEntry(ctx, e2.ID); got.EncVersion != 1 || got.Date != nil {
		t.Fatalf("%+v", got)
	}

	// move e1 to another category: Work is still used by e2
	if err := s.UpdateEntry(ctx, Entry{ID: e1.ID, Name: str("a"), Category: str("Home"), Content: []byte{3}}); err != nil {
		t.Fatal(err)
	}
	cats, _ = s.ListCategories(ctx, nb.ID)
	if len(cats) != 2 {
		t.Fatalf("%v", cats)
	}
	// uncategorise e2: Work becomes unused
	if err := s.UpdateEntry(ctx, Entry{ID: e2.ID, Content: []byte{4}}); err != nil {
		t.Fatal(err)
	}
	cats, _ = s.ListCategories(ctx, nb.ID)
	if len(cats) != 1 || cats[0] != "Home" {
		t.Fatalf("%v", cats)
	}
	if err := s.DeleteEntry(ctx, e1.ID); err != nil {
		t.Fatal(err)
	}
	if cats, _ = s.ListCategories(ctx, nb.ID); len(cats) != 0 {
		t.Fatalf("%v", cats)
	}
	if err := s.DeleteEntry(ctx, e1.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestUpdateEntryClearsContentV2(t *testing.T) {
	s := newTestStore(t)
	u := seedUser(t, s, "alice")
	nb := seedNotebook(t, s, u, true)
	e, _ := s.CreateEntry(ctx, nb.ID, Entry{Content: []byte{1}})
	if err := s.SetContentV2(ctx, u, map[int64][]byte{e.ID: {9}}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.GetEntry(ctx, e.ID); !got.HasContentV2 {
		t.Fatal("contentv2 should be set")
	}
	if err := s.UpdateEntry(ctx, Entry{ID: e.ID, Content: []byte{2}}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.GetEntry(ctx, e.ID)
	if got.HasContentV2 || got.EncVersion != 1 || got.Content[0] != 2 {
		t.Fatalf("%+v", got)
	}
	if err := s.UpdateEntry(ctx, Entry{ID: 12345}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestSetRatingReplacesLegacyFormattedRow(t *testing.T) {
	s := newTestStore(t)
	u := seedUser(t, s, "alice")
	if _, err := s.DB.Exec(`INSERT INTO dayratings (userid, date, rating) VALUES (?, '2025-08-02 00:00:00', 1)`, u); err != nil {
		t.Fatal(err)
	}
	d := day(2025, 8, 2)
	if err := s.SetRating(ctx, u, d, 4); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.DB.QueryRow(`SELECT COUNT(*) FROM dayratings WHERE userid = ?`, u).Scan(&n); err != nil || n != 1 {
		t.Fatalf("%d %v", n, err)
	}
	r, err := s.GetRating(ctx, u, d)
	if err != nil || r == nil || *r != 4 {
		t.Fatalf("%v %v", r, err)
	}
	if err := s.SetRating(ctx, u, d, 0); err != nil {
		t.Fatal(err)
	}
	if r, _ := s.GetRating(ctx, u, d); r == nil || *r != 0 {
		t.Fatalf("%v", r)
	}
}

func TestRatingsRangeAndClear(t *testing.T) {
	s := newTestStore(t)
	u := seedUser(t, s, "alice")
	other := seedUser(t, s, "bob")
	for i := 1; i <= 5; i++ {
		if err := s.SetRating(ctx, u, day(2026, 10, i), i-1); err != nil {
			t.Fatal(err)
		}
	}
	_ = s.SetRating(ctx, other, day(2026, 10, 2), 3)
	got, err := s.ListRatings(ctx, u, day(2026, 10, 2), day(2026, 10, 4))
	if err != nil || len(got) != 3 || got[0].Value != 1 || got[0].Date.Day() != 2 {
		t.Fatalf("%+v %v", got, err)
	}
	if err := s.ClearRating(ctx, u, day(2026, 10, 3)); err != nil {
		t.Fatal(err)
	}
	if r, _ := s.GetRating(ctx, u, day(2026, 10, 3)); r != nil {
		t.Fatal("expected cleared")
	}
	if err := s.ClearRating(ctx, u, day(2026, 10, 3)); err != nil {
		t.Fatalf("clearing twice should be fine: %v", err)
	}
}

func TestAPIKeyOwnership(t *testing.T) {
	s := newTestStore(t)
	a, b := seedUser(t, s, "alice"), seedUser(t, s, "bob")
	at := time.Date(2026, 10, 18, 9, 5, 3, 123456700, time.UTC)
	k1, err := s.CreateAPIKey(ctx, a, "key-a", "A", at)
	if err != nil || k1.ID == 0 {
		t.Fatalf("%+v %v", k1, err)
	}
	k2, err := s.CreateAPIKey(ctx, a, "key-a2", "A2", at)
	if err != nil || k2.ID == k1.ID {
		t.Fatalf("%+v %v", k2, err)
	}
	list, err := s.ListAPIKeys(ctx, a)
	if err != nil || len(list) != 2 || !list[0].CreatedAt.Equal(at) {
		t.Fatalf("%+v %v", list, err)
	}
	if uid, err := s.UserIDByAPIKey(ctx, "key-a"); err != nil || uid != a {
		t.Fatalf("%d %v", uid, err)
	}
	if _, err := s.UserIDByAPIKey(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
	if err := s.DeleteAPIKey(ctx, b, k1.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("other user deleted key: %v", err)
	}
	if err := s.DeleteAPIKey(ctx, a, k1.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.UserIDByAPIKey(ctx, "key-a"); !errors.Is(err, ErrNotFound) {
		t.Fatal("key should be gone")
	}
}

func TestUserKeys(t *testing.T) {
	s := newTestStore(t)
	s.Now = func() time.Time { return time.Date(2026, 10, 18, 0, 0, 0, 0, time.UTC) }
	u := seedUser(t, s, "alice")
	if _, err := s.GetUserKey(ctx, u); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
	k := UserKey{UserID: u, KdfSalt: []byte{1}, KdfIterations: 600000, WrappedKey: []byte{2}, Status: KeyStatusMigrating, PendingAuthHash: "p"}
	if err := s.UpsertUserKey(ctx, k); err != nil {
		t.Fatal(err)
	}
	got, err := s.GetUserKey(ctx, u)
	if err != nil || got.Status != "migrating" || got.PendingAuthHash != "p" || got.KdfIterations != 600000 {
		t.Fatalf("%+v %v", got, err)
	}
	k.Status, k.PendingAuthHash = KeyStatusActive, ""
	if err := s.UpsertUserKey(ctx, k); err != nil {
		t.Fatal(err)
	}
	got, _ = s.GetUserKey(ctx, u)
	if got.Status != "active" || got.PendingAuthHash != "" {
		t.Fatalf("%+v", got)
	}

	if _, err := s.LegacyKeyParams(ctx, u); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
	if _, err := s.DB.Exec(`INSERT INTO settings (userid, settingid, value) VALUES (?, -1, 'pbkdf2:5000:AA==:32')`, u); err != nil {
		t.Fatal(err)
	}
	if v, err := s.LegacyKeyParams(ctx, u); err != nil || v != "pbkdf2:5000:AA==:32" {
		t.Fatalf("%q %v", v, err)
	}
	if err := s.DeleteLegacyKeyParams(ctx, u); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LegacyKeyParams(ctx, u); !errors.Is(err, ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

// migrationFixture creates a user with three legacy entries and one v2 entry.
func migrationFixture(t *testing.T) (s *Store, userID int64, ids []int64) {
	t.Helper()
	s = newTestStore(t)
	userID = seedUser(t, s, "alice")
	nb := seedNotebook(t, s, userID, true)
	for i := 1; i <= 3; i++ {
		d := day(2026, 10, i)
		e, err := s.CreateEntry(ctx, nb.ID, Entry{Date: &d, Content: []byte{byte(i)}})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, e.ID)
	}
	if _, err := s.CreateEntry(ctx, nb.ID, Entry{Content: []byte{99}, EncVersion: 2}); err != nil {
		t.Fatal(err)
	}
	return s, userID, ids
}

func TestPendingEntriesExcludesMigratedAndSkipped(t *testing.T) {
	s, u, ids := migrationFixture(t)
	if total, migrated, _ := s.MigrationCounts(ctx, u); total != 3 || migrated != 0 {
		t.Fatalf("%d %d", total, migrated)
	}
	if err := s.SetContentV2(ctx, u, map[int64][]byte{ids[0]: {10}}); err != nil {
		t.Fatal(err)
	}
	if err := s.SkipEntries(ctx, u, []int64{ids[1]}); err != nil {
		t.Fatal(err)
	}
	p, err := s.PendingEntries(ctx, u, 50)
	if err != nil || len(p) != 1 || p[0].ID != ids[2] || p[0].NotebookName != "Notebook" || p[0].Date == nil {
		t.Fatalf("%+v %v", p, err)
	}
	if total, migrated, _ := s.MigrationCounts(ctx, u); total != 3 || migrated != 2 {
		t.Fatalf("%d %d", total, migrated)
	}
	if p, _ := s.PendingEntries(ctx, u, 0); len(p) != 0 {
		t.Fatal("limit not honoured")
	}
}

func TestSetContentV2IgnoresForeignEntries(t *testing.T) {
	s, _, ids := migrationFixture(t)
	other := seedUser(t, s, "mallory")
	if err := s.SetContentV2(ctx, other, map[int64][]byte{ids[0]: {66}}); err != nil {
		t.Fatal(err)
	}
	if err := s.SkipEntries(ctx, other, []int64{ids[0]}); err != nil {
		t.Fatal(err)
	}
	if e, _ := s.GetEntry(ctx, ids[0]); e.HasContentV2 {
		t.Fatal("foreign user wrote contentv2")
	}
	var skipped int
	_ = s.DB.QueryRow(`SELECT migrationskipped FROM notebookentries WHERE id = ?`, ids[0]).Scan(&skipped)
	if skipped != 0 {
		t.Fatal("foreign user skipped entry")
	}
}

func TestFinalizeMigrationRequiresAll(t *testing.T) {
	s, u, ids := migrationFixture(t)
	_ = s.SetContentV2(ctx, u, map[int64][]byte{ids[0]: {10}, ids[1]: {11}})
	if err := s.FinalizeMigration(ctx, u); !errors.Is(err, ErrConflict) {
		t.Fatalf("got %v", err)
	}
	if e, _ := s.GetEntry(ctx, ids[0]); e.EncVersion != 1 || e.Content[0] != 1 {
		t.Fatalf("nothing may change on failure: %+v", e)
	}
}

func TestFinalizeMigrationSwapsContent(t *testing.T) {
	s, u, ids := migrationFixture(t)
	_ = s.SetContentV2(ctx, u, map[int64][]byte{ids[0]: {10}, ids[1]: {11}})
	_ = s.SkipEntries(ctx, u, []int64{ids[2]})
	if err := s.FinalizeMigration(ctx, u); err != nil {
		t.Fatal(err)
	}
	e0, _ := s.GetEntry(ctx, ids[0])
	if e0.EncVersion != 2 || e0.HasContentV2 || len(e0.Content) != 1 || e0.Content[0] != 10 {
		t.Fatalf("%+v", e0)
	}
	e2, _ := s.GetEntry(ctx, ids[2])
	if e2.EncVersion != 1 || e2.Content[0] != 3 {
		t.Fatalf("skipped entry must stay legacy: %+v", e2)
	}
	if total, migrated, _ := s.MigrationCounts(ctx, u); total != 1 || migrated != 1 {
		t.Fatalf("%d %d", total, migrated)
	}
	// users without entries finalize instantly
	empty := seedUser(t, s, "empty")
	if err := s.FinalizeMigration(ctx, empty); err != nil {
		t.Fatal(err)
	}
}
