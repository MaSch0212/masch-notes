package service

import (
	"bytes"
	"fmt"
	"testing"

	"github.com/MaSch0212/masch-notes/server/internal/api"
)

var migAuthKey = bytes.Repeat([]byte{8}, 32)

func startBody(salt byte) map[string]any {
	return map[string]any{
		"kdfSalt": b64(bytes.Repeat([]byte{salt}, 16)), "kdfIterations": 600000,
		"wrappedKey": b64(bytes.Repeat([]byte{salt + 1}, 60)), "authKey": b64(migAuthKey),
	}
}

// seedLegacyEntries creates a legacy notebook with n legacy entries and returns their ids.
func (s *testServer) seedLegacyEntries(tok string, n int) []int64 {
	s.t.Helper()
	nb := s.newNotebook(tok, "Legacy", false)
	ids := make([]int64, 0, n)
	for i := range n {
		var e api.NotebookEntry
		code := s.doJSON("POST", fmt.Sprintf("/api/notebooks/%d/entries", nb.ID), tok,
			map[string]any{"name": fmt.Sprintf("e%d", i), "content": b64([]byte(fmt.Sprintf("legacy-%d", i)))}, &e)
		if code != 201 || e.EncVersion != 1 {
			s.t.Fatalf("seed entry: %d %+v", code, e)
		}
		ids = append(ids, e.ID)
	}
	return ids
}

func v2Blob(tag byte) []byte { return bytes.Repeat([]byte{tag}, 40) }

func (s *testServer) migrationState(tok string) api.MigrationInfo {
	s.t.Helper()
	var info api.MigrationInfo
	if code := s.doJSON("GET", "/api/crypto/migration", tok, nil, &info); code != 200 {
		s.t.Fatalf("get migration: %d", code)
	}
	return info
}

func TestMigrationStartIsIdempotentResume(t *testing.T) {
	s := newTestServer(t)
	id := s.seedLegacyUser("alice", "pw")
	tok := s.tokenFor(id)
	if st := s.migrationState(tok); st.Status != api.MigrationStatusNone || len(st.LegacySalt) != 16 {
		t.Fatalf("%+v", st)
	}
	var first api.MigrationInfo
	if code := s.doJSON("POST", "/api/crypto/migration/start", tok, startBody(1), &first); code != 200 {
		t.Fatalf("start: %d", code)
	}
	if first.Status != api.MigrationStatusMigrating || !bytes.Equal(first.KdfSalt, bytes.Repeat([]byte{1}, 16)) ||
		first.KdfIterations == nil || *first.KdfIterations != 600000 || len(first.WrappedKey) != 60 || len(first.LegacySalt) != 16 {
		t.Fatalf("%+v", first)
	}
	k1, _ := s.Store.GetUserKey(bg, id)
	var second api.MigrationInfo
	s.doJSON("POST", "/api/crypto/migration/start", tok, startBody(5), &second)
	k2, _ := s.Store.GetUserKey(bg, id)
	if !bytes.Equal(second.KdfSalt, first.KdfSalt) || !bytes.Equal(second.WrappedKey, first.WrappedKey) || k1.PendingAuthHash != k2.PendingAuthHash {
		t.Fatalf("resume must not change the row: %+v", second)
	}
	if st := s.migrationState(tok); st.Status != api.MigrationStatusMigrating {
		t.Fatalf("%+v", st)
	}
	// the legacy password keeps working while migrating
	if code, _ := s.do("POST", "/api/auth/login", "", map[string]any{"username": "alice", "password": "pw"}); code != 200 {
		t.Fatalf("legacy login while migrating: %d", code)
	}
	// v2 users cannot start
	v2 := s.tokenFor(s.seedV2User("bob", authKey))
	code, raw := s.do("POST", "/api/crypto/migration/start", v2, startBody(1))
	expectStatus(t, code, 409, raw)
	if errCode(t, raw) != "alreadyMigrated" {
		t.Fatal(errCode(t, raw))
	}
	if st := s.migrationState(v2); st.Status != api.MigrationStatusDone || st.LegacySalt != nil {
		t.Fatalf("v2 user: %+v", st)
	}
	code, raw = s.do("POST", "/api/crypto/migration/start", s.tokenFor(s.seedLegacyUser("carol", "pw")), map[string]any{"kdfSalt": b64([]byte("x"))})
	expectStatus(t, code, 400, raw)
}

func TestMigrationPendingPagination(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	ids := s.seedLegacyEntries(tok, 5)
	if code, raw := s.do("GET", "/api/crypto/migration/pending", tok, nil); code != 409 || errCode(t, raw) != "migrationNotStarted" {
		t.Fatalf("before start: %d %s", code, raw)
	}
	s.do("POST", "/api/crypto/migration/start", tok, startBody(1))
	if st := s.migrationState(tok); st.TotalEntries != 5 || st.MigratedEntries != 0 {
		t.Fatalf("%+v", st)
	}
	seen := map[int64]bool{}
	for range 3 {
		var page []api.PendingEntry
		if code := s.doJSON("GET", "/api/crypto/migration/pending?limit=2", tok, nil, &page); code != 200 {
			t.Fatalf("pending: %d", code)
		}
		if len(page) == 0 {
			break
		}
		if len(page) > 2 {
			t.Fatalf("limit ignored: %d", len(page))
		}
		upload := []map[string]any{}
		for _, p := range page {
			if seen[p.ID] || p.NotebookName != "Legacy" || len(p.Content) == 0 {
				t.Fatalf("bad pending entry %+v", p)
			}
			seen[p.ID] = true
			upload = append(upload, map[string]any{"id": p.ID, "content": b64(v2Blob(1))})
		}
		if code, raw := s.do("POST", "/api/crypto/migration/entries", tok, upload); code != 204 {
			t.Fatalf("upload: %d %s", code, raw)
		}
	}
	if len(seen) != 5 {
		t.Fatalf("saw %d of %v", len(seen), ids)
	}
	var page []api.PendingEntry
	s.doJSON("GET", "/api/crypto/migration/pending", tok, nil, &page)
	if len(page) != 0 {
		t.Fatalf("still pending: %d", len(page))
	}
	if st := s.migrationState(tok); st.MigratedEntries != 5 {
		t.Fatalf("%+v", st)
	}
}

func TestMigrationUploadOnlyOwnLegacyEntries(t *testing.T) {
	s := newTestServer(t)
	aliceID := s.seedLegacyUser("alice", "pw")
	tok := s.tokenFor(aliceID)
	mine := s.seedLegacyEntries(tok, 1)[0]
	bobTok := s.tokenFor(s.seedLegacyUser("bob", "pw"))
	theirs := s.seedLegacyEntries(bobTok, 1)[0]
	s.do("POST", "/api/crypto/migration/start", tok, startBody(1))

	code, raw := s.do("POST", "/api/crypto/migration/entries", tok, []map[string]any{
		{"id": theirs, "content": b64(v2Blob(2))}, {"id": mine, "content": b64(v2Blob(3))},
	})
	expectStatus(t, code, 204, raw)
	if e, _ := s.Store.GetEntry(bg, theirs); e.HasContentV2 {
		t.Fatal("foreign entry was modified")
	}
	if e, _ := s.Store.GetEntry(bg, mine); !e.HasContentV2 || string(e.Content) != "legacy-0" {
		t.Fatalf("own entry: %+v", e)
	}
	// size limits
	code, _ = s.do("POST", "/api/crypto/migration/entries", tok, []map[string]any{{"id": mine, "content": b64([]byte("short"))}})
	if code != 400 {
		t.Fatalf("short content: %d", code)
	}
	many := make([]map[string]any, 201)
	for i := range many {
		many[i] = map[string]any{"id": mine, "content": b64(v2Blob(1))}
	}
	if code, _ = s.do("POST", "/api/crypto/migration/entries", tok, many); code != 400 {
		t.Fatalf("201 items: %d", code)
	}
}

func TestMigrationCompleteIncomplete409(t *testing.T) {
	s := newTestServer(t)
	id := s.seedLegacyUser("alice", "pw")
	tok := s.tokenFor(id)
	ids := s.seedLegacyEntries(tok, 2)
	if code, raw := s.do("POST", "/api/crypto/migration/complete", tok, nil); code != 409 || errCode(t, raw) != "migrationNotStarted" {
		t.Fatalf("not started: %d %s", code, raw)
	}
	s.do("POST", "/api/crypto/migration/start", tok, startBody(1))
	s.do("POST", "/api/crypto/migration/entries", tok, []map[string]any{{"id": ids[0], "content": b64(v2Blob(1))}})
	code, raw := s.do("POST", "/api/crypto/migration/complete", tok, nil)
	expectStatus(t, code, 409, raw)
	if errCode(t, raw) != "migrationIncomplete" {
		t.Fatal(errCode(t, raw))
	}
	k, _ := s.Store.GetUserKey(bg, id)
	if k.Status != "migrating" {
		t.Fatalf("state changed on failure: %+v", k)
	}
	if e, _ := s.Store.GetEntry(bg, ids[0]); e.EncVersion != 1 || string(e.Content) != "legacy-0" {
		t.Fatalf("content swapped despite failure: %+v", e)
	}
}

func TestMigrationCompleteSwitchesLogin(t *testing.T) {
	s := newTestServer(t)
	id := s.seedLegacyUser("alice", "pw")
	tok := s.tokenFor(id)
	ids := s.seedLegacyEntries(tok, 2)
	s.do("POST", "/api/crypto/migration/start", tok, startBody(1))
	for i, eid := range ids {
		s.do("POST", "/api/crypto/migration/entries", tok, []map[string]any{{"id": eid, "content": b64(v2Blob(byte(10 + i)))}})
	}
	if code, raw := s.do("POST", "/api/crypto/migration/complete", tok, nil); code != 204 {
		t.Fatalf("complete: %d %s", code, raw)
	}
	for i, eid := range ids {
		e, _ := s.Store.GetEntry(bg, eid)
		if e.EncVersion != 2 || !bytes.Equal(e.Content, v2Blob(byte(10+i))) || e.HasContentV2 {
			t.Fatalf("entry %d: %+v", eid, e)
		}
	}
	if code, _ := s.do("POST", "/api/auth/login", "", map[string]any{"username": "alice", "password": "pw"}); code != 401 {
		t.Fatalf("legacy login after completion: %d", code)
	}
	var r api.LoginResponse
	if code := s.doJSON("POST", "/api/auth/login", "", map[string]any{"username": "alice", "authKey": b64(migAuthKey)}, &r); code != 200 {
		t.Fatalf("v2 login: %d", code)
	}
	if r.Scheme != api.KeySchemeV2 || !bytes.Equal(r.WrappedKey, bytes.Repeat([]byte{2}, 60)) {
		t.Fatalf("%+v", r)
	}
	var pre api.PreloginResponse
	s.doJSON("POST", "/api/auth/prelogin", "", map[string]any{"username": "alice"}, &pre)
	if pre.Scheme != api.KeySchemeV2 || !bytes.Equal(pre.KdfSalt, bytes.Repeat([]byte{1}, 16)) {
		t.Fatalf("%+v", pre)
	}
	if st := s.migrationState(tok); st.Status != api.MigrationStatusDone {
		t.Fatalf("%+v", st)
	}
	if _, err := s.Store.LegacyKeyParams(bg, id); err == nil {
		t.Fatal("legacy key params not deleted")
	}
	if code, _ := s.do("POST", "/api/crypto/migration/start", tok, startBody(1)); code != 409 {
		t.Fatalf("restart after completion: %d", code)
	}
}

func TestMigrationSkipThenComplete(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	ids := s.seedLegacyEntries(tok, 2)
	s.do("POST", "/api/crypto/migration/start", tok, startBody(1))
	s.do("POST", "/api/crypto/migration/entries", tok, []map[string]any{{"id": ids[0], "content": b64(v2Blob(1))}})
	if code, raw := s.do("POST", "/api/crypto/migration/skip", tok, map[string]any{"entryIds": []int64{ids[1]}}); code != 204 {
		t.Fatalf("skip: %d %s", code, raw)
	}
	if code, raw := s.do("POST", "/api/crypto/migration/complete", tok, nil); code != 204 {
		t.Fatalf("complete: %d %s", code, raw)
	}
	skipped, _ := s.Store.GetEntry(bg, ids[1])
	if skipped.EncVersion != 1 || string(skipped.Content) != "legacy-1" {
		t.Fatalf("skipped entry changed: %+v", skipped)
	}
	done, _ := s.Store.GetEntry(bg, ids[0])
	if done.EncVersion != 2 {
		t.Fatalf("%+v", done)
	}
}

func TestMigrationUserWithoutEntries(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	if code, _ := s.do("POST", "/api/crypto/migration/start", tok, startBody(1)); code != 200 {
		t.Fatalf("start: %d", code)
	}
	if code, raw := s.do("POST", "/api/crypto/migration/complete", tok, nil); code != 204 {
		t.Fatalf("complete: %d %s", code, raw)
	}
	if code, _ := s.do("POST", "/api/auth/login", "", map[string]any{"username": "alice", "authKey": b64(migAuthKey)}); code != 200 {
		t.Fatalf("v2 login: %d", code)
	}
}
