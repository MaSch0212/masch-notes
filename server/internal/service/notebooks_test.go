package service

import (
	"bytes"
	"fmt"
	"regexp"
	"testing"

	"github.com/MaSch0212/masch-notes/server/internal/api"
)

func (s *testServer) newNotebook(tok, name string, diary bool) api.Notebook {
	s.t.Helper()
	var nb api.Notebook
	code := s.doJSON("POST", "/api/notebooks", tok, map[string]any{"name": name, "isDiary": diary}, &nb)
	if code != 201 {
		s.t.Fatalf("create notebook: %d", code)
	}
	return nb
}

func TestNotebookCRUD(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	nb := s.newNotebook(tok, "Diary", true)
	if nb.ID == 0 || !nb.IsDiary || nb.Name != "Diary" {
		t.Fatalf("%+v", nb)
	}
	var renamed api.Notebook
	if code := s.doJSON("PUT", fmt.Sprintf("/api/notebooks/%d", nb.ID), tok, map[string]any{"name": "Journal"}, &renamed); code != 200 || renamed.Name != "Journal" {
		t.Fatalf("%d %+v", code, renamed)
	}
	var list []api.Notebook
	s.doJSON("GET", "/api/notebooks", tok, nil, &list)
	if len(list) != 1 || list[0].Name != "Journal" {
		t.Fatalf("%+v", list)
	}
	var got api.Notebook
	if code := s.doJSON("GET", fmt.Sprintf("/api/notebooks/%d", nb.ID), tok, nil, &got); code != 200 || got != renamed {
		t.Fatalf("%d %+v", code, got)
	}
	if code, _ := s.do("POST", "/api/notebooks", tok, map[string]any{"name": " ", "isDiary": false}); code != 400 {
		t.Fatalf("empty name: %d", code)
	}
	if code, _ := s.do("DELETE", fmt.Sprintf("/api/notebooks/%d", nb.ID), tok, nil); code != 204 {
		t.Fatalf("delete: %d", code)
	}
	if code, _ := s.do("GET", fmt.Sprintf("/api/notebooks/%d", nb.ID), tok, nil); code != 404 {
		t.Fatalf("after delete: %d", code)
	}
}

func TestNotebookOwnership404(t *testing.T) {
	s := newTestServer(t)
	alice := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	mallory := s.tokenFor(s.seedLegacyUser("mallory", "pw"))
	nb := s.newNotebook(alice, "Private", false)
	var e api.NotebookEntry
	s.doJSON("POST", fmt.Sprintf("/api/notebooks/%d/entries", nb.ID), alice, map[string]any{"name": "n", "content": b64([]byte("x"))}, &e)
	base := fmt.Sprintf("/api/notebooks/%d", nb.ID)
	for _, c := range []struct{ m, p string }{
		{"GET", base},
		{"PUT", base},
		{"DELETE", base},
		{"GET", base + "/entries"},
		{"POST", base + "/entries"},
		{"GET", base + "/categories"},
		{"GET", fmt.Sprintf("%s/entries/%d", base, e.ID)},
		{"PUT", fmt.Sprintf("%s/entries/%d", base, e.ID)},
		{"DELETE", fmt.Sprintf("%s/entries/%d", base, e.ID)},
	} {
		code, raw := s.do(c.m, c.p, mallory, map[string]any{"name": "x", "content": b64([]byte("y"))})
		expectStatus(t, code, 404, raw)
		if errCode(t, raw) != "notFound" {
			t.Errorf("%s %s: %s", c.m, c.p, raw)
		}
	}
	// entry of another notebook of the same user is 404 as well
	other := s.newNotebook(alice, "Other", false)
	code, _ := s.do("GET", fmt.Sprintf("/api/notebooks/%d/entries/%d", other.ID, e.ID), alice, nil)
	if code != 404 {
		t.Fatalf("entry outside notebook: %d", code)
	}
}

func TestEntryCRUDRoundTripsContentBytes(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	nb := s.newNotebook(tok, "Notes", false)
	base := fmt.Sprintf("/api/notebooks/%d/entries", nb.ID)
	content := []byte{0, 1, 2, 250, 251, 252, 255}
	var e api.NotebookEntry
	code := s.doJSON("POST", base, tok, map[string]any{"name": "Title", "category": "Work", "content": b64(content)}, &e)
	if code != 201 || e.ID == 0 || e.NotebookID != nb.ID || !bytes.Equal(e.Content, content) || e.Category == nil || *e.Category != "Work" {
		t.Fatalf("%d %+v", code, e)
	}
	var got api.NotebookEntry
	s.doJSON("GET", fmt.Sprintf("%s/%d", base, e.ID), tok, nil, &got)
	if !bytes.Equal(got.Content, content) || got.Name == nil || *got.Name != "Title" {
		t.Fatalf("%+v", got)
	}
	updated := []byte("new")
	var up api.NotebookEntry
	code = s.doJSON("PUT", fmt.Sprintf("%s/%d", base, e.ID), tok, map[string]any{"name": "T2", "content": b64(updated)}, &up)
	if code != 200 || !bytes.Equal(up.Content, updated) || *up.Name != "T2" || up.Category != nil {
		t.Fatalf("%d %+v", code, up)
	}
	var cats []string
	s.doJSON("GET", fmt.Sprintf("/api/notebooks/%d/categories", nb.ID), tok, nil, &cats)
	if len(cats) != 0 {
		t.Fatalf("unused category not cleaned: %v", cats)
	}
	if code, _ := s.do("DELETE", fmt.Sprintf("%s/%d", base, e.ID), tok, nil); code != 204 {
		t.Fatalf("delete: %d", code)
	}
	if code, _ := s.do("GET", fmt.Sprintf("%s/%d", base, e.ID), tok, nil); code != 404 {
		t.Fatalf("after delete: %d", code)
	}
	if code, _ := s.do("POST", base, tok, map[string]any{"content": b64(content)}); code != 400 {
		t.Fatalf("regular entry without name: %d", code)
	}
}

func TestCreateDiaryEntryConflict(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	nb := s.newNotebook(tok, "Diary", true)
	base := fmt.Sprintf("/api/notebooks/%d/entries", nb.ID)
	var first api.NotebookEntry
	if code := s.doJSON("POST", base, tok, map[string]any{"date": "2025-08-02", "content": b64([]byte("a"))}, &first); code != 201 {
		t.Fatalf("%d", code)
	}
	if first.Date == nil || *first.Date != "2025-08-02" {
		t.Fatalf("%+v", first)
	}
	var c api.ConflictError
	code := s.doJSON("POST", base, tok, map[string]any{"date": "2025-08-02", "content": b64([]byte("b"))}, &c)
	if code != 409 || c.Code != "entryExists" || c.EntryID != first.ID {
		t.Fatalf("%d %+v", code, c)
	}
	// another date is fine; moving onto an occupied date is a conflict
	var second api.NotebookEntry
	s.doJSON("POST", base, tok, map[string]any{"date": "2025-08-03", "content": b64([]byte("c"))}, &second)
	code, _ = s.do("PUT", fmt.Sprintf("%s/%d", base, second.ID), tok, map[string]any{"date": "2025-08-02", "content": b64([]byte("c"))})
	if code != 409 {
		t.Fatalf("update onto occupied date: %d", code)
	}
}

func TestCreateDiaryEntryRequiresDate(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	nb := s.newNotebook(tok, "Diary", true)
	code, raw := s.do("POST", fmt.Sprintf("/api/notebooks/%d/entries", nb.ID), tok, map[string]any{"content": b64([]byte("a"))})
	expectStatus(t, code, 400, raw)
	if errCode(t, raw) != "dateRequired" {
		t.Fatal(errCode(t, raw))
	}
}

func TestListEntriesRangeAndIncludeContent(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	nb := s.newNotebook(tok, "Diary", true)
	base := fmt.Sprintf("/api/notebooks/%d/entries", nb.ID)
	for _, d := range []string{"2025-08-01", "2025-08-02", "2025-08-03", "2025-09-01"} {
		s.do("POST", base, tok, map[string]any{"date": d, "content": b64([]byte(d))})
	}
	var list []api.NotebookEntry
	s.doJSON("GET", base+"?from=2025-08-02&to=2025-08-31", tok, nil, &list)
	if len(list) != 2 || *list[0].Date != "2025-08-02" || *list[1].Date != "2025-08-03" || list[0].Content != nil {
		t.Fatalf("%+v", list)
	}
	list = nil
	s.doJSON("GET", base+"?from=2025-08-02&to=2025-08-02&includeContent=true", tok, nil, &list)
	if len(list) != 1 || string(list[0].Content) != "2025-08-02" {
		t.Fatalf("%+v", list)
	}
	list = nil
	s.doJSON("GET", base, tok, nil, &list)
	if len(list) != 4 {
		t.Fatalf("all: %d", len(list))
	}
	if code, _ := s.do("GET", base+"?from=garbage", tok, nil); code != 400 {
		t.Fatalf("bad date: %d", code)
	}
}

func TestEntryMonthCounts(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	nb := s.newNotebook(tok, "Diary", true)
	base := fmt.Sprintf("/api/notebooks/%d/entries", nb.ID)
	for _, d := range []string{"2024-12-31", "2025-08-01", "2025-08-02", "2025-09-01"} {
		s.do("POST", base, tok, map[string]any{"date": d, "content": b64([]byte(d))})
	}
	// Legacy rows use the "yyyy-MM-dd HH:mm:ss" format; undated rows are not counted.
	if _, err := s.Store.DB.Exec(`INSERT INTO notebookentries (notebookid, date, content) VALUES (?, '2025-08-20 00:00:00', x'00'), (?, NULL, x'00')`, nb.ID, nb.ID); err != nil {
		t.Fatal(err)
	}
	var counts []api.MonthCount
	if code := s.doJSON("GET", fmt.Sprintf("/api/notebooks/%d/month-counts", nb.ID), tok, nil, &counts); code != 200 {
		t.Fatalf("status %d", code)
	}
	want := []api.MonthCount{{Month: "2024-12", Count: 1}, {Month: "2025-08", Count: 3}, {Month: "2025-09", Count: 1}}
	if fmt.Sprint(counts) != fmt.Sprint(want) {
		t.Fatalf("got %+v want %+v", counts, want)
	}
	mallory := s.tokenFor(s.seedLegacyUser("mallory", "pw"))
	if code, _ := s.do("GET", fmt.Sprintf("/api/notebooks/%d/month-counts", nb.ID), mallory, nil); code != 404 {
		t.Fatalf("other user: %d", code)
	}
}

func TestEntryEncVersionFollowsUserKey(t *testing.T) {
	s := newTestServer(t)
	legacy := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	v2 := s.tokenFor(s.seedV2User("bob", authKey))
	for tok, want := range map[string]int{legacy: 1, v2: 2} {
		nb := s.newNotebook(tok, "N", false)
		var e api.NotebookEntry
		s.doJSON("POST", fmt.Sprintf("/api/notebooks/%d/entries", nb.ID), tok, map[string]any{"name": "x", "content": b64([]byte("c"))}, &e)
		if e.EncVersion != want {
			t.Errorf("create: encVersion %d, want %d", e.EncVersion, want)
		}
		var up api.NotebookEntry
		s.doJSON("PUT", fmt.Sprintf("/api/notebooks/%d/entries/%d", nb.ID, e.ID), tok, map[string]any{"name": "y", "content": b64([]byte("d"))}, &up)
		if up.EncVersion != want {
			t.Errorf("update: encVersion %d, want %d", up.EncVersion, want)
		}
	}
}

func TestRatingsSetListClear(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	var r api.DayRating
	if code := s.doJSON("PUT", "/api/day-ratings/2025-08-02", tok, map[string]any{"rating": 3}, &r); code != 200 || r.Date != "2025-08-02" || r.Rating != 3 {
		t.Fatalf("%d %+v", code, r)
	}
	s.do("PUT", "/api/day-ratings/2025-08-02", tok, map[string]any{"rating": 0})
	s.do("PUT", "/api/day-ratings/2025-08-05", tok, map[string]any{"rating": 4})
	var list []api.DayRating
	s.doJSON("GET", "/api/day-ratings?from=2025-08-01&to=2025-08-31", tok, nil, &list)
	if len(list) != 2 || list[0].Rating != 0 || list[1].Date != "2025-08-05" {
		t.Fatalf("%+v", list)
	}
	if code, _ := s.do("DELETE", "/api/day-ratings/2025-08-02", tok, nil); code != 204 {
		t.Fatalf("clear: %d", code)
	}
	list = nil
	s.doJSON("GET", "/api/day-ratings?from=2025-08-01&to=2025-08-31", tok, nil, &list)
	if len(list) != 1 {
		t.Fatalf("%+v", list)
	}
	other := s.tokenFor(s.seedLegacyUser("bob", "pw"))
	list = nil
	s.doJSON("GET", "/api/day-ratings?from=2025-08-01&to=2025-08-31", other, nil, &list)
	if len(list) != 0 {
		t.Fatalf("ratings leaked across users: %+v", list)
	}
}

func TestRatingOutOfRange400(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	for _, v := range []int{-1, 5} {
		code, raw := s.do("PUT", "/api/day-ratings/2025-08-02", tok, map[string]any{"rating": v})
		expectStatus(t, code, 400, raw)
		if errCode(t, raw) != "invalidRating" {
			t.Fatal(errCode(t, raw))
		}
	}
	if code, _ := s.do("GET", "/api/day-ratings?from=2025-09-01&to=2025-08-01", tok, nil); code != 400 {
		t.Fatalf("from > to: %d", code)
	}
}

func TestAPIKeyCreateListDelete(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	var created api.CreatedAPIKey
	if code := s.doJSON("POST", "/api/api-keys", tok, map[string]any{"name": "Shortcut"}, &created); code != 201 || created.Key == "" || created.APIKey.Name != "Shortcut" {
		t.Fatalf("%d %+v", code, created)
	}
	var list []api.APIKey
	s.doJSON("GET", "/api/api-keys", tok, nil, &list)
	if len(list) != 1 || list[0].ID != created.APIKey.ID {
		t.Fatalf("%+v", list)
	}
	other := s.tokenFor(s.seedLegacyUser("bob", "pw"))
	if code, _ := s.do("DELETE", fmt.Sprintf("/api/api-keys/%d", created.APIKey.ID), other, nil); code != 404 {
		t.Fatalf("foreign delete: %d", code)
	}
	if code, _ := s.do("DELETE", fmt.Sprintf("/api/api-keys/%d", created.APIKey.ID), tok, nil); code != 204 {
		t.Fatalf("delete: %d", code)
	}
	list = nil
	s.doJSON("GET", "/api/api-keys", tok, nil, &list)
	if len(list) != 0 {
		t.Fatalf("%+v", list)
	}
	if code, _ := s.do("POST", "/api/api-keys", tok, map[string]any{"name": ""}); code != 400 {
		t.Fatalf("empty name: %d", code)
	}
}

func TestAPIKeyBase62Alphabet(t *testing.T) {
	re := regexp.MustCompile(`^[0-9A-Za-z]{43,44}$`)
	seen := map[string]bool{}
	for range 50 {
		k, err := newAPIKey()
		if err != nil {
			t.Fatal(err)
		}
		if !re.MatchString(k) {
			t.Fatalf("bad key %q", k)
		}
		if seen[k] {
			t.Fatal("duplicate key")
		}
		seen[k] = true
	}
}

func TestAPIKeyAuthenticatesRequest(t *testing.T) {
	s := newTestServer(t)
	tok := s.tokenFor(s.seedLegacyUser("alice", "pw"))
	s.newNotebook(tok, "Via key", false)
	var created api.CreatedAPIKey
	s.doJSON("POST", "/api/api-keys", tok, map[string]any{"name": "k"}, &created)
	var list []api.Notebook
	if code := s.doJSON("GET", "/api/notebooks?apikey="+created.Key, "", nil, &list); code != 200 || len(list) != 1 {
		t.Fatalf("%d %+v", code, list)
	}
	if code, _ := s.do("GET", "/api/notebooks?apikey=wrong", "", nil); code != 401 {
		t.Fatalf("wrong key: %d", code)
	}
}
