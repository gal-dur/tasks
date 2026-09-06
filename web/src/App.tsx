import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * The board: four columns over one tree, and a task opened beside them.
 *
 * The server scans and extracts; everything about how a task *reads* — markdown
 * included — happens here. Which task is open is the URL's (`/42`), so a deep link
 * lands where it points and Back closes what it opened.
 */

interface Task {
  readonly number: number;
  readonly title: string;
  readonly status: string;
  readonly priority?: string;
  readonly size?: string;
  readonly depends_on?: readonly number[];
  readonly rejection_reason?: string;
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

const useOpened = () => {
  const [opened, setOpened] = useState<number | undefined>(numberInPath);
  useEffect(() => {
    const read = () => setOpened(numberInPath());
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  const open = (number: number) => {
    window.history.pushState(null, "", `/${number}`);
    setOpened(number);
  };
  const close = () => {
    window.history.pushState(null, "", "/");
    setOpened(undefined);
  };
  return { opened, open, close };
};

const Chip = ({ kind, children }: { kind?: string; children: React.ReactNode }) => (
  <span className={`chip ${kind ?? ""}`}>{children}</span>
);

const Card = ({ task, onOpen }: { task: Task; onOpen: (n: number) => void }) => (
  <button className="card" onClick={() => onOpen(task.number)}>
    <div className="cardtitle">
      <span className="num">{task.number}</span> {task.title}
    </div>
    <div className="cardmeta">
      {task.priority && <Chip kind={task.priority}>{task.priority}</Chip>}
      {task.size && <Chip>{task.size}</Chip>}
      {(task.depends_on ?? []).map((n) => (
        <Chip key={n}>↳ {n}</Chip>
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

/** One task, whole and full-screen: metadata line, the rejection reason where there is
 *  one, the body. Escape is the way back — the same gesture every overlay owes. */
const Opened = ({ number, onClose }: { number: number; onClose: () => void }) => {
  const [task, setTask] = useState<Task | undefined>();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
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
            <Chip>{task.status}</Chip>
            {task.priority && <Chip kind={task.priority}>{task.priority}</Chip>}
            {task.size && <Chip>{task.size}</Chip>}
            {(task.depends_on ?? []).map((n) => (
              <Chip key={n}>↳ {n}</Chip>
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
  const { opened, open, close } = useOpened();

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
  return (
    <>
      <header>
        <h1>tasks</h1>
      </header>
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
      {opened !== undefined && <Opened number={opened} onClose={close} />}
    </>
  );
};
