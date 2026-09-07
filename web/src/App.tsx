import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * One tree, two ways to read it: a board of four columns, and a flat list.
 *
 * The server scans and extracts; everything about how a task *reads* — markdown
 * included — happens here. Which task is open is the URL's (`/42`) and so is which view
 * is showing (`?view=list`), so a deep link lands where it points, Back closes what it
 * opened, and a link to the list stays the list.
 *
 * **The two views share one order.** The board reads column by column, planned through
 * rejected; the list is that same sequence unwrapped. Keeping them identical is what lets
 * the arrow keys step through an opened task the same way whichever view you came from.
 */

type View = "board" | "list";
type Theme = "light" | "dark";
type SortKey = "number" | "title" | "status" | "priority" | "size" | "blocked";
interface Sort {
  readonly key: SortKey;
  readonly dir: "asc" | "desc";
}

const SORT_KEYS: readonly SortKey[] = [
  "number", "title", "status", "priority", "size", "blocked",
];

/**
 * Ranked, not alphabetised. Sorting priority as text gives high, low, medium — three
 * words in an order that means nothing. The same applies to size and to status, whose
 * real order is the board's own columns. Anything unset ranks last: a task with no size
 * is not smaller than an S, it is simply unsaid.
 */
const PRIORITIES: readonly string[] = ["high", "medium", "low"];
const SIZES: readonly string[] = ["S", "S-M", "M", "M-L", "L"];

const rank = (order: readonly string[], value: string | undefined): number => {
  const at = value === undefined ? -1 : order.indexOf(value);
  return at < 0 ? order.length : at;
};

const compare = (a: Task, b: Task, key: SortKey, statuses: readonly string[]): number => {
  switch (key) {
    case "number":
      return a.number - b.number;
    case "title":
      return a.title.localeCompare(b.title);
    case "status":
      return statuses.indexOf(a.status) - statuses.indexOf(b.status);
    case "priority":
      return rank(PRIORITIES, a.priority) - rank(PRIORITIES, b.priority);
    case "size":
      return rank(SIZES, a.size) - rank(SIZES, b.size);
    case "blocked":
      // How much is in the way, which is what somebody scanning this column wants —
      // not which number happens to be first.
      return (a.depends_on ?? []).length - (b.depends_on ?? []).length;
  }
};

/**
 * The rows in the order asked for, falling back to the order they arrived in.
 *
 * **The natural order is the tiebreak, never a re-sort.** Two tasks of the same priority
 * keep their board positions rather than jumping about, so a sort is a rearrangement of
 * the list you already know rather than a different list.
 */
const sortedRows = (
  rows: readonly Task[],
  sort: Sort | undefined,
  statuses: readonly string[],
): readonly Task[] => {
  if (sort === undefined) {
    return rows;
  }
  const natural = new Map(rows.map((task, at) => [task.number, at]));
  return [...rows].sort((a, b) => {
    const by = compare(a, b, sort.key, statuses) * (sort.dir === "desc" ? -1 : 1);
    return by !== 0 ? by : (natural.get(a.number) ?? 0) - (natural.get(b.number) ?? 0);
  });
};

interface Task {
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly priority?: string;
  readonly size?: string;
  readonly depends_on?: readonly number[];
  readonly rejection_reason?: string;
  /** Work only a person can do. Shown as a badge; agents are forbidden to pick it up. */
  readonly is_human?: boolean;
  readonly body?: string;
}

interface Board {
  readonly statuses: readonly string[];
  readonly tasks: readonly Task[];
}

/** The task the address names, or nothing on the board itself. */
const numberInPath = (): number | undefined => {
  const digits = window.location.pathname.slice(1);
  return /^\d+$/.test(digits) ? Number(digits) : undefined;
};

const viewInSearch = (): View =>
  new URLSearchParams(window.location.search).get("view") === "list" ? "list" : "board";

/** The view is the URL's too, so it survives a reload and travels in a shared link.
 *  Replaced rather than pushed: switching how you look at the board is not a place to
 *  come back to with Back. */
const useView = () => {
  const [view, setState] = useState<View>(viewInSearch);
  useEffect(() => {
    const read = () => setState(viewInSearch());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const setView = (next: View) => {
    const search = next === "list" ? "?view=list" : "";
    window.history.replaceState(null, "", `${window.location.pathname}${search}`);
    setState(next);
  };
  return { view, setView };
};

const useOpened = () => {
  const [opened, setOpened] = useState<number | undefined>(numberInPath);
  useEffect(() => {
    const read = () => setOpened(numberInPath());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  // The query carries the view, so every navigation keeps it: opening a task from the
  // list and closing it again must not silently drop you back onto the board.
  const open = (number: number) => {
    window.history.pushState(null, "", `/${number}${window.location.search}`);
    setOpened(number);
  };
  const close = () => {
    window.history.pushState(null, "", `/${window.location.search}`);
    setOpened(undefined);
  };
  // Arrow-stepping replaces rather than pushes: browsing is one visit, and Back
  // should return to the board, not replay every step of it.
  const step = (number: number) => {
    window.history.replaceState(null, "", `/${number}${window.location.search}`);
    setOpened(number);
  };
  return { opened, open, close, step };
};

/**
 * How the list is ordered, in the URL beside the view.
 *
 * Same reasoning as the view: a sort changes *what is being looked at*, so "everything by
 * priority" is a thing worth linking to. Absent means the board's own order, and clicking
 * a column cycles ascending, descending, back to that — because the natural order is
 * meaningful here and a reader should be able to get back to it without reloading.
 */
const sortInSearch = (): Sort | undefined => {
  const search = new URLSearchParams(window.location.search);
  const key = search.get("sort");
  if (key === null || !SORT_KEYS.includes(key as SortKey)) {
    return undefined;
  }
  return { key: key as SortKey, dir: search.get("dir") === "desc" ? "desc" : "asc" };
};

const useSort = () => {
  const [sort, setState] = useState<Sort | undefined>(sortInSearch);
  useEffect(() => {
    const read = () => setState(sortInSearch());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const by = (key: SortKey) => {
    const next: Sort | undefined =
      sort?.key !== key
        ? { key, dir: "asc" }
        : sort.dir === "asc"
          ? { key, dir: "desc" }
          : undefined;
    const search = new URLSearchParams(window.location.search);
    if (next === undefined) {
      search.delete("sort");
      search.delete("dir");
    } else {
      search.set("sort", next.key);
      search.set("dir", next.dir);
    }
    const query = search.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query === "" ? "" : `?${query}`}`,
    );
    setState(next);
  };
  return { sort, by };
};

/**
 * The theme, remembered per reader rather than per link.
 *
 * **Deliberately not in the URL, unlike the view.** Which view you are looking at is a
 * property of *what is being looked at*, so it belongs in a shareable address; whether
 * you like dark is a property of *you*, and forcing it on whoever opens your link would
 * be rude. So: localStorage, and until something is stored the system decides — including
 * when the system changes under a tab that is already open.
 */
const systemTheme = (): Theme =>
  window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const storedTheme = (): Theme | undefined => {
  const value = window.localStorage.getItem("theme");
  return value === "light" || value === "dark" ? value : undefined;
};

const useTheme = () => {
  const [theme, setState] = useState<Theme>(() => storedTheme() ?? systemTheme());

  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    // Only while unchosen: once a reader has picked, the system stops speaking for them.
    const follow = () => storedTheme() === undefined && setState(systemTheme());
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("theme", next);
    setState(next);
  };
  return { theme, toggle };
};

const Chip = ({ kind, children }: { kind?: string; children: React.ReactNode }) => (
  <span className={`chip ${kind ?? ""}`}>{children}</span>
);

/**
 * A dependency, as the thing it points at.
 *
 * A blocker's number is only useful if you can go and read it — "blocked by 79" is a
 * question, and one click should answer it. `stopPropagation` because these sit inside a
 * card that is itself a button: clicking the blocker must open the blocker, not its
 * dependent.
 */
const Blocker = ({ number, onOpen }: { number: number; onOpen: (n: number) => void }) => (
  <button
    className="chip blocker"
    title={`Open task ${number}`}
    onClick={(event) => {
      event.stopPropagation();
      onOpen(number);
    }}
  >
    ↳ {number}
  </button>
);

const Card = ({ task, onOpen }: { task: Task; onOpen: (n: number) => void }) => (
  <button className="card" onClick={() => onOpen(task.number)}>
    <div className="cardtitle">
      <span className="num">{task.number}</span> {task.title}
    </div>
    <div className="cardmeta">
      {task.is_human && <Chip kind="human">you</Chip>}
      {task.priority && <Chip kind={task.priority}>{task.priority}</Chip>}
      {task.size && <Chip>{task.size}</Chip>}
      {(task.depends_on ?? []).map((n) => (
        <Blocker key={n} number={n} onOpen={onOpen} />
      ))}
      {task.rejection_reason && <Chip kind="rejected">reasoned</Chip>}
    </div>
  </button>
);

const Column = ({
  status,
  tasks,
  onOpen,
}: {
  status: string;
  tasks: readonly Task[];
  onOpen: (n: number) => void;
}) => (
  <section className="column">
    <h2>
      {status} <span>({tasks.length})</span>
    </h2>
    {tasks.map((task) => (
      <Card key={task.number} task={task} onOpen={onOpen} />
    ))}
  </section>
);

/**
 * How far along a task is, as a bar rather than a word.
 *
 * Planned, active and done are a line somebody is walking; rejected is stepping off it,
 * which is why it is not simply "100% of something". It gets a full but muted track and
 * its own class, so it never reads as finished work at a glance.
 *
 * The word is still there for anyone who needs it — as the accessible name and the
 * tooltip — because a bar alone cannot say *which* of two middling states this is.
 */
const PROGRESS: Readonly<Record<string, number>> = {
  planned: 0,
  active: 0.5,
  done: 1,
  rejected: 1,
};

const Progress = ({ status }: { status: string }) => (
  <span
    className={`progress ${status}`}
    role="img"
    aria-label={status}
    title={status}
  >
    <span className="track">
      <span className="fill" style={{ width: `${(PROGRESS[status] ?? 0) * 100}%` }} />
    </span>
  </span>
);

/** A column header that sorts. Ascending, then descending, then back to the board's own
 *  order — the third click matters, because that order is the one with meaning. */
const HeadCell = ({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: Sort | undefined;
  onSort: (key: SortKey) => void;
  className?: string;
}) => {
  const active = sort?.key === sortKey;
  return (
    <th
      className={className ?? ""}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button className={`sorter${active ? " on" : ""}`} onClick={() => onSort(sortKey)}>
        {label}
        <span className="arrow" aria-hidden>
          {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
};

/**
 * The same tasks as rows: everything at once, scannable, with the fields the board can
 * only hint at given their own columns.
 *
 * The number is plain text and the title is the control — that is how every issue tracker
 * behaves, and it keeps one focusable thing per row instead of a whole clickable `tr`
 * that a keyboard cannot reach.
 */
const List = ({
  tasks,
  sort,
  onSort,
  onOpen,
}: {
  tasks: readonly Task[];
  sort: Sort | undefined;
  onSort: (key: SortKey) => void;
  onOpen: (n: number) => void;
}) => (
  <div className="listwrap">
    <table className="list">
      <thead>
        <tr>
          <HeadCell label="#" sortKey="number" sort={sort} onSort={onSort} className="colnum" />
          <HeadCell label="Title" sortKey="title" sort={sort} onSort={onSort} />
          <HeadCell label="Status" sortKey="status" sort={sort} onSort={onSort} />
          <HeadCell label="Priority" sortKey="priority" sort={sort} onSort={onSort} />
          <HeadCell label="Size" sortKey="size" sort={sort} onSort={onSort} />
          <HeadCell label="Blocked by" sortKey="blocked" sort={sort} onSort={onSort} />
        </tr>
      </thead>
      <tbody>
        {tasks.map((task) => (
          <tr key={task.number} className={task.status}>
            <td className="colnum">{task.number}</td>
            <td>
              <button className="rowtitle" onClick={() => onOpen(task.number)}>
                {task.title}
              </button>
              {task.is_human && <Chip kind="human">you</Chip>}
              {task.rejection_reason && <Chip kind="rejected">reasoned</Chip>}
            </td>
            <td>
              <Progress status={task.status} />
            </td>
            <td>{task.priority && <Chip kind={task.priority}>{task.priority}</Chip>}</td>
            <td className="dim">{task.size ?? ""}</td>
            <td>
              {(task.depends_on ?? []).map((n) => (
                <Blocker key={n} number={n} onOpen={onOpen} />
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** One task, whole and full-screen: metadata line, the rejection reason where there is
 *  one, the body. Escape is the way back, and the arrows walk the board's own order —
 *  column by column, planned through rejected, each column as it is drawn. */
const Opened = ({
  number,
  order,
  onStep,
  onClose,
}: {
  number: number;
  order: readonly number[];
  onStep: (n: number) => void;
  onClose: () => void;
}) => {
  const [task, setTask] = useState<Task | undefined>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const at = order.indexOf(number);
        const to = order[at + (event.key === "ArrowRight" ? 1 : -1)];
        if (at >= 0 && to !== undefined) {
          onStep(to);
        }
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [number, order, onStep, onClose]);
  useEffect(() => {
    let stale = false;
    setTask(undefined);
    setMissing(false);
    void fetch(`/api/task/${number}`)
      .then((response) => (response.ok ? (response.json() as Promise<Task>) : undefined))
      .then((found) => {
        if (!stale) {
          if (found === undefined) {
            setMissing(true);
          } else {
            setTask(found);
          }
        }
      })
      .catch(() => !stale && setMissing(true));
    return () => {
      stale = true;
    };
  }, [number]);

  return (
    <aside className="opened">
      <div className="inner">
      <div className="openedbar">
        <span className="num">{number}</span>
        <span className="grow" />
        <button className="close" onClick={onClose} aria-label="Close (Esc)">
          ✕
        </button>
      </div>
      {missing && <p className="dim">No task carries this number.</p>}
      {task && (
        <>
          <div className="cardmeta">
            {task.is_human && <Chip kind="human">yours, not the agent's</Chip>}
            <Chip>{task.status}</Chip>
            {task.priority && <Chip kind={task.priority}>{task.priority}</Chip>}
            {task.size && <Chip>{task.size}</Chip>}
            {(task.depends_on ?? []).map((n) => (
              <Blocker key={n} number={n} onOpen={onStep} />
            ))}
          </div>
          {task.rejection_reason && (
            <p className="rejection">Rejected: {task.rejection_reason}</p>
          )}
          <article className="body">
            <Markdown remarkPlugins={[remarkGfm]}>{task.body ?? ""}</Markdown>
          </article>
        </>
      )}
      </div>
    </aside>
  );
};

export const App = () => {
  const [board, setBoard] = useState<Board | undefined>();
  const [failed, setFailed] = useState(false);
  const { opened, open, close, step } = useOpened();
  const { view, setView } = useView();
  const { theme, toggle } = useTheme();
  const { sort, by } = useSort();

  useEffect(() => {
    void fetch("/api/board")
      .then((response) => (response.ok ? (response.json() as Promise<Board>) : undefined))
      .then((answer) => (answer === undefined ? setFailed(true) : setBoard(answer)))
      .catch(() => setFailed(true));
    // Refetched when the window regains focus: a `git mv` in the terminal beside
    // this tab should show on the next glance without a manual reload.
    const refresh = () => {
      void fetch("/api/board")
        .then((response) => (response.ok ? (response.json() as Promise<Board>) : undefined))
        .then((answer) => answer && setBoard(answer));
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  if (failed) {
    return <p className="dim">The task tree could not be read.</p>;
  }
  if (board === undefined) {
    return <p className="dim">Loading…</p>;
  }
  // The board's order: statuses left to right, each column exactly as it is drawn. The
  // list starts from that and may sort it — and the arrows follow whatever is on screen,
  // so stepping through tasks always matches the order you are reading.
  const ordered = board.statuses.flatMap((status) =>
    board.tasks.filter((task) => task.status === status),
  );
  const rows = sortedRows(ordered, sort, board.statuses);
  const stepping = view === "list" ? rows : ordered;

  return (
    <>
      <header>
        <h1>tasks</h1>
        <span className="grow" />
        <div className="views" role="group" aria-label="View">
          <button
            className={view === "board" ? "on" : ""}
            aria-pressed={view === "board"}
            onClick={() => setView("board")}
          >
            board
          </button>
          <button
            className={view === "list" ? "on" : ""}
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            list
          </button>
        </div>
        <button
          className="theme"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light" : "Switch to dark"}
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
      </header>
      {view === "board" ? (
        <div className="board">
          {board.statuses.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={board.tasks.filter((task) => task.status === status)}
              onOpen={open}
            />
          ))}
        </div>
      ) : (
        <List tasks={rows} sort={sort} onSort={by} onOpen={open} />
      )}
      {opened !== undefined && (
        <Opened
          number={opened}
          order={stepping.map((task) => task.number)}
          onStep={step}
          onClose={close}
        />
      )}
    </>
  );
};
