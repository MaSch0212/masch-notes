package service

import (
	"context"
	"time"

	"github.com/MaSch0212/masch-notes/server/internal/api"
	"github.com/MaSch0212/masch-notes/server/internal/store"
)

// DayRatingsService implements api.DayRatingsService.
type DayRatingsService struct {
	Store *store.Store
}

var _ api.DayRatingsService = (*DayRatingsService)(nil)

const maxRating = 4

func (s *DayRatingsService) ListRatings(ctx context.Context, req api.ListRatingsRequest) (api.ListRatingsResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	from, err := parseDay("from", req.From)
	if err != nil {
		return nil, err
	}
	to, err := parseDay("to", req.To)
	if err != nil {
		return nil, err
	}
	if from.After(to) {
		return nil, badRequest("invalidRange", "from must not be after to")
	}
	list, err := s.Store.ListRatings(ctx, uid, from, to)
	if err != nil {
		return nil, err
	}
	out := make([]api.DayRating, 0, len(list))
	for _, r := range list {
		out = append(out, api.DayRating{Date: r.Date.Format(time.DateOnly), Rating: r.Value})
	}
	return api.ListRatings200Response{Body: out}, nil
}

func (s *DayRatingsService) SetRating(ctx context.Context, req api.SetRatingRequest) (api.SetRatingResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	date, err := parseDay("date", req.Date)
	if err != nil {
		return nil, err
	}
	if req.Body.Rating < 0 || req.Body.Rating > maxRating {
		return nil, badRequest("invalidRating", "rating must be between 0 and 4")
	}
	if err := s.Store.SetRating(ctx, uid, date, req.Body.Rating); err != nil {
		return nil, err
	}
	return api.SetRating200Response{Body: api.DayRating{Date: date.Format(time.DateOnly), Rating: req.Body.Rating}}, nil
}

func (s *DayRatingsService) ClearRating(ctx context.Context, req api.ClearRatingRequest) (api.ClearRatingResponse, error) {
	uid, err := userID(ctx)
	if err != nil {
		return nil, err
	}
	date, err := parseDay("date", req.Date)
	if err != nil {
		return nil, err
	}
	if err := s.Store.ClearRating(ctx, uid, date); err != nil {
		return nil, err
	}
	return api.ClearRating204Response{}, nil
}
