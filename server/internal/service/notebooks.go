package service

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/db"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// NotebooksService implements api.NotebooksService.
type NotebooksService struct {
	Store *store.Store
}

var _ api.NotebooksService = (*NotebooksService)(nil)

func toAPINotebook(n store.Notebook) api.Notebook {
	return api.Notebook{ID: n.ID, Name: n.Name, IsDiary: n.IsDiary}
}

func toAPIEntry(e store.Entry) api.NotebookEntry {
	out := api.NotebookEntry{
		ID: e.ID, NotebookID: e.NotebookID, Name: e.Name, Category: e.Category,
		EncVersion: e.EncVersion, Content: e.Content,
	}
	if e.Date != nil {
		d := e.Date.Format(time.DateOnly)
		out.Date = &d
	}
	return out
}

// ownedNotebook returns the notebook when it belongs to the user; otherwise ErrNotFound.
func (s *NotebooksService) ownedNotebook(ctx context.Context, userID, notebookID int64) (store.Notebook, error) {
	nb, err := s.Store.GetNotebook(ctx, notebookID)
	if err != nil {
		return store.Notebook{}, err
	}
	if nb.UserID != userID {
		return store.Notebook{}, store.ErrNotFound
	}
	return nb, nil
}

// ownedEntry returns the entry when it is part of an owned notebook.
func (s *NotebooksService) ownedEntry(ctx context.Context, userID, notebookID, entryID int64) (store.Notebook, store.Entry, error) {
	nb, err := s.ownedNotebook(ctx, userID, notebookID)
	if err != nil {
		return store.Notebook{}, store.Entry{}, err
	}
	e, err := s.Store.GetEntry(ctx, entryID)
	if err != nil {
		return store.Notebook{}, store.Entry{}, err
	}
	if e.NotebookID != nb.ID {
		return store.Notebook{}, store.Entry{}, store.ErrNotFound
	}
	return nb, e, nil
}

func parseDay(field, v string) (time.Time, error) {
	t, err := db.DateOnly(v)
	if err != nil {
		return time.Time{}, badRequest("invalidDate", field+" must be a date (yyyy-MM-dd)")
	}
	return t, nil
}

func optionalDay(field string, v *string) (*time.Time, error) {
	if v == nil || *v == "" {
		return nil, nil //nolint:nilnil // nil means not given
	}
	t, err := parseDay(field, *v)
	if err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *NotebooksService) ListNotebooks(ctx context.Context, _ api.ListNotebooksRequest) (api.ListNotebooksResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	list, err := s.Store.ListNotebooks(ctx, uid)
	if err != nil {
		return nil, err
	}
	out := make([]api.Notebook, 0, len(list))
	for _, n := range list {
		out = append(out, toAPINotebook(n))
	}
	return api.ListNotebooks200Response{Body: out}, nil
}

func (s *NotebooksService) CreateNotebook(ctx context.Context, req api.CreateNotebookRequest) (api.CreateNotebookResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Body.Name)
	if name == "" {
		return nil, badRequest("nameRequired", "name is required")
	}
	nb, err := s.Store.CreateNotebook(ctx, uid, name, req.Body.IsDiary)
	if err != nil {
		return nil, err
	}
	return api.CreateNotebook201Response{Body: toAPINotebook(nb)}, nil
}

func (s *NotebooksService) GetNotebook(ctx context.Context, req api.GetNotebookRequest) (api.GetNotebookResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	nb, err := s.ownedNotebook(ctx, uid, req.NotebookID)
	if err != nil {
		return nil, err
	}
	return api.GetNotebook200Response{Body: toAPINotebook(nb)}, nil
}

func (s *NotebooksService) RenameNotebook(ctx context.Context, req api.RenameNotebookRequestObject) (api.RenameNotebookResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	nb, err := s.ownedNotebook(ctx, uid, req.NotebookID)
	if err != nil {
		return nil, err
	}
	name := strings.TrimSpace(req.Body.Name)
	if name == "" {
		return nil, badRequest("nameRequired", "name is required")
	}
	if err := s.Store.RenameNotebook(ctx, nb.ID, name); err != nil {
		return nil, err
	}
	nb.Name = name
	return api.RenameNotebook200Response{Body: toAPINotebook(nb)}, nil
}

func (s *NotebooksService) DeleteNotebook(ctx context.Context, req api.DeleteNotebookRequest) (api.DeleteNotebookResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	nb, err := s.ownedNotebook(ctx, uid, req.NotebookID)
	if err != nil {
		return nil, err
	}
	if err := s.Store.DeleteNotebook(ctx, nb.ID); err != nil {
		return nil, err
	}
	return api.DeleteNotebook204Response{}, nil
}

func (s *NotebooksService) ListEntries(ctx context.Context, req api.ListEntriesRequest) (api.ListEntriesResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.ownedNotebook(ctx, uid, req.NotebookID); err != nil {
		return nil, err
	}
	from, err := optionalDay("from", req.From)
	if err != nil {
		return nil, err
	}
	to, err := optionalDay("to", req.To)
	if err != nil {
		return nil, err
	}
	withContent := req.IncludeContent != nil && *req.IncludeContent
	list, err := s.Store.ListEntries(ctx, req.NotebookID, from, to, withContent)
	if err != nil {
		return nil, err
	}
	out := make([]api.NotebookEntry, 0, len(list))
	for _, e := range list {
		out = append(out, toAPIEntry(e))
	}
	return api.ListEntries200Response{Body: out}, nil
}

// entryFromInput validates the input for the kind of notebook and builds the store entry.
func (s *NotebooksService) entryFromInput(ctx context.Context, uid int64, nb store.Notebook, in api.EntryInput) (store.Entry, error) {
	date, err := optionalDay("date", in.Date)
	if err != nil {
		return store.Entry{}, err
	}
	if nb.IsDiary && date == nil {
		return store.Entry{}, badRequest("dateRequired", "date is required for diary entries")
	}
	if !nb.IsDiary && (in.Name == nil || strings.TrimSpace(*in.Name) == "") {
		return store.Entry{}, badRequest("nameRequired", "name is required")
	}
	_, active, err := activeKey(ctx, s.Store, uid)
	if err != nil {
		return store.Entry{}, err
	}
	enc := 1
	if active {
		enc = 2
	}
	content := in.Content
	if content == nil {
		content = []byte{}
	}
	e := store.Entry{NotebookID: nb.ID, Name: in.Name, Category: in.Category, Date: date, EncVersion: enc, Content: content}
	if in.Category != nil && strings.TrimSpace(*in.Category) == "" {
		e.Category = nil
	}
	return e, nil
}

func (s *NotebooksService) CreateEntry(ctx context.Context, req api.CreateEntryRequest) (api.CreateEntryResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	nb, err := s.ownedNotebook(ctx, uid, req.NotebookID)
	if err != nil {
		return nil, err
	}
	e, err := s.entryFromInput(ctx, uid, nb, req.Body)
	if err != nil {
		return nil, err
	}
	var created store.Entry
	var conflictID int64
	err = s.Store.Tx(ctx, func(tx *store.Store) error {
		if nb.IsDiary {
			existing, err := tx.EntryByDate(ctx, nb.ID, *e.Date)
			if err == nil {
				conflictID = existing.ID
				return store.ErrConflict
			}
			if !errors.Is(err, store.ErrNotFound) {
				return err
			}
		}
		var err error
		created, err = tx.CreateEntry(ctx, nb.ID, e)
		return err
	})
	if errors.Is(err, store.ErrConflict) && conflictID != 0 {
		return api.CreateEntry409Response{Body: api.ConflictError{
			Code: "entryExists", Message: "an entry for this date already exists", EntryID: conflictID,
		}}, nil
	}
	if err != nil {
		return nil, err
	}
	return api.CreateEntry201Response{Body: toAPIEntry(created)}, nil
}

func (s *NotebooksService) GetEntry(ctx context.Context, req api.GetEntryRequest) (api.GetEntryResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	_, e, err := s.ownedEntry(ctx, uid, req.NotebookID, req.EntryID)
	if err != nil {
		return nil, err
	}
	return api.GetEntry200Response{Body: toAPIEntry(e)}, nil
}

func (s *NotebooksService) UpdateEntry(ctx context.Context, req api.UpdateEntryRequest) (api.UpdateEntryResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	nb, _, err := s.ownedEntry(ctx, uid, req.NotebookID, req.EntryID)
	if err != nil {
		return nil, err
	}
	e, err := s.entryFromInput(ctx, uid, nb, req.Body)
	if err != nil {
		return nil, err
	}
	e.ID = req.EntryID
	var updated store.Entry
	err = s.Store.Tx(ctx, func(tx *store.Store) error {
		if nb.IsDiary {
			other, err := tx.EntryByDate(ctx, nb.ID, *e.Date)
			if err == nil && other.ID != e.ID {
				return newError(http.StatusConflict, "entryExists", "an entry for this date already exists")
			}
			if err != nil && !errors.Is(err, store.ErrNotFound) {
				return err
			}
		}
		if err := tx.UpdateEntry(ctx, e); err != nil {
			return err
		}
		var err error
		updated, err = tx.GetEntry(ctx, e.ID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return api.UpdateEntry200Response{Body: toAPIEntry(updated)}, nil
}

func (s *NotebooksService) DeleteEntry(ctx context.Context, req api.DeleteEntryRequest) (api.DeleteEntryResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if _, _, err := s.ownedEntry(ctx, uid, req.NotebookID, req.EntryID); err != nil {
		return nil, err
	}
	if err := s.Store.DeleteEntry(ctx, req.EntryID); err != nil {
		return nil, err
	}
	return api.DeleteEntry204Response{}, nil
}

func (s *NotebooksService) ListCategories(ctx context.Context, req api.ListCategoriesRequest) (api.ListCategoriesResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.ownedNotebook(ctx, uid, req.NotebookID); err != nil {
		return nil, err
	}
	cats, err := s.Store.ListCategories(ctx, req.NotebookID)
	if err != nil {
		return nil, err
	}
	return api.ListCategories200Response{Body: cats}, nil
}

func (s *NotebooksService) ListMonthCounts(ctx context.Context, req api.ListMonthCountsRequest) (api.ListMonthCountsResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	if _, err := s.ownedNotebook(ctx, uid, req.NotebookID); err != nil {
		return nil, err
	}
	counts, err := s.Store.ListMonthCounts(ctx, req.NotebookID)
	if err != nil {
		return nil, err
	}
	body := make([]api.MonthCount, len(counts))
	for i, c := range counts {
		body[i] = api.MonthCount{Month: c.Month, Count: c.Count}
	}
	return api.ListMonthCounts200Response{Body: body}, nil
}
