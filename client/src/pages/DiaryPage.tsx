import { useNavigate, useParams } from '@solidjs/router';
import { CalendarDays, Trash2 } from 'lucide-solid';
import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  on,
  onCleanup,
  Show,
  Switch,
  Match,
  type JSX,
} from 'solid-js';
import { MonthCalendar } from '../components/MonthCalendar';
import { EntryEditor } from '../components/EntryEditor';
import { MoodPicker } from '../components/MoodPicker';
import { NotebookPicker } from '../components/NotebookPicker';
import { RecordButton } from '../components/RecordButton';
import { SaveStatus } from '../components/SaveStatus';
import { WeekStrip } from '../components/WeekStrip';
import { Button, Modal, Popover, showToast, Spinner } from '../components/ui';
import { apiError, ApiRequestError, unwrap } from '../lib/api';
import { encryptContent } from '../lib/crypto/v2';
import {
  firstOfMonth,
  formatDayMonthYear,
  formatMonthYear,
  formatWeekday,
  monthGrid,
  parseIsoDate,
  toIsoDate,
} from '../lib/dates';
import { applyAiResult } from '../lib/ai-jobs';
import { useAiEnabled } from '../lib/config';
import { createEntrySaver, decryptEntry, trackSave, whenSaved } from '../lib/entries';
import { errorKey } from '../lib/errors';
import { useI18n } from '../lib/i18n';
import { layout } from '../lib/layout';
import { useNotebooks } from '../lib/notebooks';
import { useSession } from '../lib/session-context';

const AUTOSAVE_MS = 800;

/** Handle for features that write into an entry (e.g. voice recording). */
export type PaneController = {
  /** Appends text after a blank line (no separator for an empty entry) and saves immediately. */
  append(text: string): Promise<void>;
  /** Current editor text. */
  text(): string;
};

type PaneItem = { id?: number; text: string; unreadable: boolean };

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export default function DiaryPage() {
  const { t, locale } = useI18n();
  const session = useSession();
  const store = useNotebooks();
  const params = useParams<{ notebookId: string; date?: string }>();
  const navigate = useNavigate();

  const notebookId = () => Number(params.notebookId);
  const notebook = () => store.notebooks()?.find((n) => n.id === notebookId() && n.isDiary);
  const today = () => toIsoDate(new Date());
  const selected = () => (params.date && ISO.test(params.date) ? params.date : today());

  const [month, setMonth] = createSignal(firstOfMonth(parseIsoDate(selected())));
  createEffect(on(selected, (s) => setMonth(firstOfMonth(parseIsoDate(s))), { defer: true }));

  const [ratings, setRatings] = createSignal(new Map<string, number>());
  const [entryDays, setEntryDays] = createSignal(new Set<string>());

  const range = createMemo(() => {
    const grid = monthGrid(month().getFullYear(), month().getMonth());
    return `${toIsoDate(grid[0]![0]!)}|${toIsoDate(grid[5]![6]!)}`;
  });

  // Ratings are user-wide; entry days belong to this diary.
  let ratingSeq = 0;
  createEffect(
    on(range, (r) => {
      const [from, to] = r.split('|') as [string, string];
      const seq = ++ratingSeq;
      unwrap(session.api.dayRatings.listRatings({ from, to }))
        .then((list) => {
          if (seq !== ratingSeq) return;
          setRatings((prev) => {
            const next = new Map([...prev].filter(([d]) => d < from || d > to));
            for (const x of list) next.set(x.date, x.rating);
            return next;
          });
        })
        .catch((e) => showToast(t(errorKey(apiError(e).code)), 'error'));
    }),
  );

  let daysSeq = 0;
  createEffect(
    on([range, notebookId], ([r, nb], prev) => {
      if (prev && prev[1] !== nb) setEntryDays(new Set<string>());
      const [from, to] = r.split('|') as [string, string];
      const seq = ++daysSeq;
      unwrap(session.api.notebooks.listEntries({ notebookId: nb, from, to }))
        .then((list) => {
          if (seq !== daysSeq) return;
          setEntryDays((p) => {
            const next = new Set([...p].filter((d) => d < from || d > to));
            for (const e of list) if (e.date) next.add(e.date.slice(0, 10));
            return next;
          });
        })
        .catch((e) => showToast(t(errorKey(apiError(e).code)), 'error'));
    }),
  );

  const markEntryDay = (date: string, has: boolean) =>
    setEntryDays((p) => {
      const next = new Set(p);
      if (has) next.add(date);
      else next.delete(date);
      return next;
    });

  const setMood = async (value: number | null) => {
    const date = selected();
    const previous = ratings().get(date);
    const apply = (v: number | undefined) =>
      setRatings((p) => {
        const next = new Map(p);
        if (v === undefined) next.delete(date);
        else next.set(date, v);
        return next;
      });
    apply(value ?? undefined);
    try {
      if (value === null) await unwrap(session.api.dayRatings.clearRating({ date }));
      else await unwrap(session.api.dayRatings.setRating({ date }, { rating: value }));
    } catch (e) {
      apply(previous);
      showToast(t(errorKey(apiError(e).code)), 'error');
    }
  };

  const select = (date: string) => {
    if (date !== selected()) navigate(`/diary/${notebookId()}/${date}`);
  };

  const aiEnabled = useAiEnabled();

  const renderHeaderActions = (controller: PaneController): JSX.Element => (
    <Show when={aiEnabled()}>
      <RecordButton
        kind="diary"
        date={selected()}
        onResult={(result) =>
          applyAiResult(result, {
            append: controller.append,
            hasMood: () => ratings().has(selected()),
            setMood: (mood) => void setMood(mood),
          })
        }
      />
    </Show>
  );

  const dayCard = () => (
    <Show when={`${notebookId()}:${selected()}`} keyed>
      {(_key) => (
        <DayView
          notebookId={notebookId()}
          date={selected()}
          rating={ratings().get(selected()) ?? null}
          onRating={setMood}
          onEntryDay={markEntryDay}
        />
      )}
    </Show>
  );

  const todayButton = (
    <Show when={selected() !== today()}>
      <Button variant="ghost" class="px-3 py-1.5" onClick={() => select(today())}>
        {t('diary.today')}
      </Button>
    </Show>
  );

  return (
    <Show
      when={notebook()}
      fallback={<p class="p-8 text-center text-muted">{t('diary.notFound')}</p>}
    >
      <Switch>
        <Match when={layout() === 'wide'}>
          <div class="mx-auto flex max-w-6xl items-start gap-6 p-6">
            <aside class="sticky top-6 w-72 shrink-0 rounded-2xl border border-line bg-panel p-4 shadow-sm">
              <MonthCalendar
                month={month()}
                selected={selected()}
                ratings={ratings()}
                entryDays={entryDays()}
                onSelect={select}
                onMonthChange={setMonth}
              />
              <div class="mt-3 flex justify-center">{todayButton}</div>
            </aside>
            <div class="min-w-0 flex-1">{dayCard()}</div>
          </div>
        </Match>
        <Match when={true}>
          <div class="mx-auto flex max-w-3xl flex-col gap-3 p-3 medium:p-5">
            <div class="flex items-center justify-between gap-2">
              <NotebookPicker notebook={notebook()} isDiary />
              <div class="flex shrink-0 items-center gap-2">
                {todayButton}
                <MonthButton
                  month={month()}
                  selected={selected()}
                  ratings={ratings()}
                  entryDays={entryDays()}
                  onSelect={select}
                  onMonthChange={setMonth}
                />
              </div>
            </div>
            <WeekStrip
              selected={selected()}
              ratings={ratings()}
              entryDays={entryDays()}
              onSelect={select}
            />
            {dayCard()}
          </div>
        </Match>
      </Switch>
    </Show>
  );

  function MonthButton(p: {
    month: Date;
    selected: string;
    ratings: Map<string, number>;
    entryDays: Set<string>;
    onSelect(date: string): void;
    onMonthChange(d: Date): void;
  }) {
    const [open, setOpen] = createSignal(false);
    const [anchor, setAnchor] = createSignal<HTMLElement>();
    const close = () => {
      setOpen(false);
      // Browsing other months inside the popover must not leave the page on a different month.
      p.onMonthChange(firstOfMonth(parseIsoDate(p.selected)));
    };
    return (
      <>
        <button
          type="button"
          ref={setAnchor}
          aria-haspopup="dialog"
          aria-expanded={open()}
          aria-label={t('diary.openMonth')}
          onClick={() => (open() ? close() : setOpen(true))}
          class="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-sm font-medium text-muted capitalize transition-colors hover:bg-rail hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <CalendarDays class="size-4" aria-hidden="true" />
          {formatMonthYear(p.month, locale())}
        </button>
        <Popover open={open()} anchor={anchor()} onClose={close} label={t('diary.openMonth')}>
          <div class="w-[min(18rem,calc(100vw-3rem))] p-1">
            <MonthCalendar
              month={p.month}
              selected={p.selected}
              ratings={p.ratings}
              entryDays={p.entryDays}
              onSelect={(d) => {
                setOpen(false);
                p.onSelect(d);
              }}
              onMonthChange={p.onMonthChange}
            />
          </div>
        </Popover>
      </>
    );
  }

  /** Everything for one day; recreated per (diary, date) so pending saves go to the right day. */
  function DayView(p: {
    notebookId: number;
    date: string;
    rating: number | null;
    onRating(v: number | null): void;
    onEntryDay(date: string, has: boolean): void;
  }) {
    const [entries, { refetch }] = createResource(async (): Promise<PaneItem[]> => {
      // A save for this very day may still be in flight (quick back-and-forth navigation).
      await whenSaved();
      const list = await unwrap(
        session.api.notebooks.listEntries({
          notebookId: p.notebookId,
          from: p.date,
          to: p.date,
          includeContent: true,
        }),
      );
      return Promise.all(list.map((e) => decryptEntry(session.state.dataKey, e)));
    });
    const items = createMemo<PaneItem[]>(() => {
      const list = entries();
      if (!list) return [];
      return list.length > 0 ? list : [{ text: '', unreadable: false }];
    });
    const date = parseIsoDate(p.date);

    const heading = (
      <div class="min-w-0">
        <div class="text-sm text-muted capitalize">{formatWeekday(date, locale())}</div>
        <h1 class="text-xl leading-tight font-bold">{formatDayMonthYear(date, locale())}</h1>
      </div>
    );

    return (
      <section
        aria-label={formatDayMonthYear(date, locale())}
        class="rounded-2xl border border-line bg-panel p-5 shadow-sm medium:p-6"
      >
        <Show
          when={!entries.error}
          fallback={
            <p role="alert" class="text-sm text-mood-0">
              {t('diary.loadFailed')}
            </p>
          }
        >
          <Show
            when={entries.state === 'ready' || entries.state === 'refreshing'}
            fallback={
              <div class="flex justify-center py-16">
                <Spinner class="size-6" />
              </div>
            }
          >
            <div class="flex flex-col gap-8">
              <For each={items()}>
                {(item, index) => (
                  <EntryPane
                    item={item}
                    notebookId={p.notebookId}
                    date={p.date}
                    heading={index() === 0 ? heading : undefined}
                    belowHeading={
                      index() === 0 ? (
                        <div class="mt-3">
                          <MoodPicker value={p.rating} onChange={p.onRating} />
                        </div>
                      ) : undefined
                    }
                    onEntryDay={p.onEntryDay}
                    onDeleted={() => void refetch()}
                  />
                )}
              </For>
            </div>
          </Show>
        </Show>
      </section>
    );
  }

  /** One editable entry of a day (normally the only one) with its own autosave. */
  function EntryPane(p: {
    item: PaneItem;
    notebookId: number;
    date: string;
    heading?: JSX.Element;
    belowHeading?: JSX.Element;
    onEntryDay(date: string, has: boolean): void;
    onDeleted(): void;
  }) {
    const [text, setText] = createSignal(p.item.text);
    const [confirmDelete, setConfirmDelete] = createSignal(false);
    const [deleting, setDeleting] = createSignal(false);
    let entryId = p.item.id;
    // Bound to this pane's day: flushing it after navigation still stores into the right day.
    const nbId = p.notebookId;
    const { date } = p;

    const saver = createEntrySaver<string>({
      debounceMs: AUTOSAVE_MS,
      save: async (content) => {
        const dataKey = session.state.dataKey;
        if (!dataKey) throw new ApiRequestError('unauthorized', 401);
        const api = session.api.notebooks;
        const body = { date, content: await encryptContent(dataKey, content) };
        const update = (id: number) =>
          unwrap(api.updateEntry({ notebookId: nbId, entryId: id }, body));
        if (entryId !== undefined) {
          await update(entryId);
          return;
        }
        if (content.trim() === '') return;
        try {
          const created = await unwrap(api.createEntry({ notebookId: nbId }, body));
          entryId = created.id;
          p.onEntryDay(date, true);
        } catch (e) {
          const err = apiError(e);
          if (err.status !== 409) throw e;
          // Someone (another tab) created this day meanwhile: update that entry instead.
          const existing = await unwrap(
            api.listEntries({ notebookId: nbId, from: date, to: date }),
          );
          const id = existing[0]?.id;
          if (id === undefined) throw e;
          entryId = id;
          p.onEntryDay(date, true);
          await update(id);
        }
      },
    });

    const flush = () => void saver.flush();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    onCleanup(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      trackSave(saver.flush());
    });

    const input = (value: string) => {
      setText(value);
      saver.change(value);
    };

    const controller: PaneController = {
      async append(addition) {
        const current = text();
        const next = current.trim() ? `${current.replace(/\s+$/, '')}\n\n${addition}` : addition;
        input(next);
        await saver.flush();
      },
      text,
    };

    const remove = async () => {
      setDeleting(true);
      saver.cancel();
      try {
        if (entryId !== undefined) {
          await unwrap(session.api.notebooks.deleteEntry({ notebookId: nbId, entryId }));
          p.onEntryDay(date, false);
        }
        setConfirmDelete(false);
        p.onDeleted();
      } catch (e) {
        showToast(t(errorKey(apiError(e).code)), 'error');
      } finally {
        setDeleting(false);
      }
    };

    return (
      <div class="mx-auto w-full max-w-[70ch]">
        <div class="flex items-start justify-between gap-3">
          <Show when={p.heading} fallback={<span />}>
            {p.heading}
          </Show>
          <div class="flex shrink-0 items-center gap-2" data-slot="header-actions">
            {renderHeaderActions(controller)}
          </div>
        </div>
        {p.belowHeading}
        <Show
          when={!p.item.unreadable}
          fallback={
            <p class="mt-4 rounded-lg bg-rail p-3 text-sm text-muted">{t('diary.unreadable')}</p>
          }
        >
          <div class="mt-4">
            <EntryEditor
              label={t('diary.placeholder')}
              value={text()}
              onInput={input}
              onBlur={flush}
              placeholder={t('diary.placeholder')}
            />
          </div>
        </Show>
        <div class="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <SaveStatus status={saver.status()} />
          <Show when={entryId !== undefined || p.item.unreadable}>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              class="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-rail hover:text-mood-0 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <Trash2 class="size-3.5" aria-hidden="true" />
              {t('diary.deleteEntry')}
            </button>
          </Show>
        </div>
        <Modal
          open={confirmDelete()}
          title={t('diary.deleteEntry')}
          onClose={() => setConfirmDelete(false)}
        >
          <p class="mb-4 text-sm text-muted">{t('diary.deleteConfirm')}</p>
          <div class="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={deleting()} onClick={() => void remove()}>
              {t('common.delete')}
            </Button>
          </div>
        </Modal>
      </div>
    );
  }
}
