import { StrictMode, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { KeyRound, LogIn } from "lucide-react";
import { TutorialCaseDetail } from "@/components/tutorial-case-detail";
import { TutorialReviewQueue } from "@/components/tutorial-review-queue";
import candidatesDocument from "@/data/tutorial/one-shanten-candidates.json";
import {
  initialTutorialCaseState,
  type TutorialCandidate,
  type TutorialCaseState,
  type TutorialReviewerId,
} from "@/domain/tutorial-review";
import "@/app/globals.css";

type Stage = "initial" | "secondary" | "final" | "rejected";
type Reviewer = { id: TutorialReviewerId; displayName: string };
type Bootstrap = { reviewer: Reviewer; states: TutorialCaseState[] };

const candidates = candidatesDocument as TutorialCandidate[];
const stages = new Set<Stage>(["initial", "secondary", "final", "rejected"]);

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const responseText = await response.text();
  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(response.status >= 500 ? "服务器暂时繁忙，请稍后刷新" : fallback);
  }
}

function stageForStatus(status: TutorialCaseState["status"]): Stage {
  if (status.startsWith("rejected")) return "rejected";
  if (status === "pending_initial") return "initial";
  if (status === "pending_secondary") return "secondary";
  return "final";
}

function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/tutorial-api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const result = await readJson<{ error?: string }>(response, "服务器返回了无效响应");
      if (!response.ok) throw new Error(result.error || "登录失败");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.replace(next?.startsWith("/tutorials/") ? next : "/tutorials/one-shanten/initial");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "登录失败");
      setPending(false);
    }
  }

  return (
    <main className="tutorial-login-page">
      <form className="tutorial-login-card" onSubmit={login}>
        <div className="tutorial-login-mark"><KeyRound size={25} /></div>
        <div><h1>轩轩的牌例筛选站</h1></div>
        <label><span>账号</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required autoFocus /></label>
        <label><span>密码</span><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
        {message && <p className="tutorial-form-error">{message}</p>}
        <button type="submit" disabled={pending}><LogIn size={17} />{pending ? "正在验证" : "登录"}</button>
      </form>
    </main>
  );
}

function LoadingPage({ message = "正在加载牌例" }: { message?: string }) {
  return (
    <main className="tutorial-loading-page" aria-live="polite" aria-busy="true">
      <div className="tutorial-loading-content">
        <div className="tutorial-loading-scene" aria-hidden="true">
          <i className="tutorial-loading-shadow" />
          <div className="tutorial-loading-mascot">
            <i className="tutorial-loading-hair" />
            <i className="tutorial-loading-face" />
            <i className="tutorial-loading-body" />
            <i className="tutorial-loading-arm left" />
            <i className="tutorial-loading-arm right" />
            <i className="tutorial-loading-tile">中</i>
          </div>
          <i className="tutorial-loading-spark spark-one" />
          <i className="tutorial-loading-spark spark-two" />
        </div>
        <strong>{message}</strong>
        <span><i /><i /><i /></span>
      </div>
    </main>
  );
}

function RouteRedirect({ to, navigate }: { to: string; navigate: (href: string, replace?: boolean) => void }) {
  useEffect(() => navigate(to, true), [navigate, to]);
  return <LoadingPage />;
}

function withRiichiTest(candidate: TutorialCandidate) {
  const declarationPositions = [1, 6, 7, 18];
  const tiles = ["1m", "9m", "1p", "9p", "1s", "9s", "1z", "2z", "3z", "4z", "5z", "6z", "7z", "2m", "8m", "2p", "8p", "2s", "8s", "3m"];
  return {
    ...candidate,
    board: {
      ...candidate.board,
      scores: candidate.board.scores.map((score) => score - 1000),
      kyotaku: candidate.board.kyotaku + 4,
      riichiSeats: [true, true, true, true],
      rivers: candidate.board.rivers.map((_river, seat) => {
        const relativeSeat = (seat - candidate.actorSeat + 4) % 4;
        const position = declarationPositions[relativeSeat];
        return Array.from({ length: position + 2 }, (_, index) => ({
          tile: tiles[(index + relativeSeat * 5) % tiles.length],
          called: false,
          riichi: index === position - 1,
          tsumogiri: index >= position,
        }));
      }),
    },
  } as TutorialCandidate;
}

function withKanTest(candidate: TutorialCandidate, kanCount: 2 | 4) {
  const bottom = candidate.actorSeat;
  const top = (bottom + 2) % 4;
  const right = (bottom + 1) % 4;
  const left = (bottom + 3) % 4;
  const affected = new Set(kanCount === 4 ? [top, right, left, bottom] : [top, right]);
  return {
    ...candidate,
    doraMarkers: [...candidate.doraMarkers, ...["3s", "6z", "9m", "1p"].slice(0, kanCount)],
    board: {
      ...candidate.board,
      concealedTileCounts: candidate.board.concealedTileCounts.map((count, seat) => affected.has(seat) ? 10 : count),
      melds: candidate.board.melds.map((melds, seat) => {
        if (seat === top) return [{ type: "ankan", tiles: ["5m", "5m", "5m", "5m"], calledIndex: null, addedTile: null }];
        if (seat === right) return [{ type: "daiminkan", tiles: ["7p", "7p", "7p", "7p"], calledIndex: 1, addedTile: null }];
        if (kanCount === 4 && seat === left) return [{ type: "ankan", tiles: ["2s", "2s", "2s", "2s"], calledIndex: null, addedTile: null }];
        if (kanCount === 4 && seat === bottom) return [{ type: "daiminkan", tiles: ["3p", "3p", "3p", "3p"], calledIndex: 1, addedTile: null }];
        return melds;
      }),
    },
  } as TutorialCandidate;
}

function ReviewApp({
  bootstrap,
  location,
  navigate,
  onReviewSaved,
}: {
  bootstrap: Bootstrap;
  location: string;
  navigate: (href: string, replace?: boolean) => void;
  onReviewSaved: (state: TutorialCaseState) => void;
}) {
  const stateById = useMemo(() => new Map(bootstrap.states.map((state) => [state.id, state])), [bootstrap.states]);
  const stateFor = (id: string) => stateById.get(id) ?? initialTutorialCaseState(id);
  const counts = {
    initial: candidates.filter((item) => stateFor(item.id).status === "pending_initial").length,
    secondary: candidates.filter((item) => stateFor(item.id).status === "pending_secondary").length,
    final: candidates.filter((item) => stateFor(item.id).status === "final").length,
    rejected: candidates.filter((item) => stateFor(item.id).status.startsWith("rejected")).length,
  };
  const url = new URL(location, window.location.origin);
  const path = url.pathname;
  const caseMatch = path.match(/^\/tutorials\/one-shanten\/cases\/([^/]+)$/);
  if (caseMatch) {
    const candidate = candidates.find((item) => item.id === decodeURIComponent(caseMatch[1]));
    if (!candidate) {
      return <RouteRedirect to="/tutorials/one-shanten/initial" navigate={navigate} />;
    }
    const state = stateFor(candidate.id);
    const inferredStage = stageForStatus(state.status);
    const requested = url.searchParams.get("stage") as Stage | null;
    const stage = requested && stages.has(requested) ? requested : inferredStage;
    const test = url.searchParams.get("test");
    if (!test && stage !== inferredStage) {
      return <RouteRedirect to={`/tutorials/one-shanten/${stage}`} navigate={navigate} />;
    }
    const queue = candidates.filter((item) => {
      const status = stateFor(item.id).status;
      return stage === "rejected" ? status.startsWith("rejected") : stageForStatus(status) === stage;
    });
    const index = queue.findIndex((item) => item.id === candidate.id);
    const visualCandidate = test === "riichi" ? withRiichiTest(candidate)
      : test === "kan" ? withKanTest(candidate, 2)
        : test === "kan4" ? withKanTest(candidate, 4) : candidate;
    return <TutorialCaseDetail
      candidate={visualCandidate}
      initialState={state}
      reviewerId={bootstrap.reviewer.id}
      reviewerName={bootstrap.reviewer.displayName}
      reviewStage={stage}
      counts={counts}
      previousCaseId={index > 0 ? queue[index - 1].id : null}
      nextCaseId={index >= 0 && index < queue.length - 1 ? queue[index + 1].id : null}
      visualTestMode={test === "riichi" || test === "kan" || test === "kan4" ? test : undefined}
      onNavigate={navigate}
      onReviewSaved={onReviewSaved}
    />;
  }

  const stageMatch = path.match(/^\/tutorials\/one-shanten\/(initial|secondary|final|rejected)$/);
  const stage = (stageMatch?.[1] || "initial") as Stage;
  return <TutorialReviewQueue stage={stage} candidates={candidates} storedStates={bootstrap.states} reviewerName={bootstrap.reviewer.displayName} />;
}

function Root() {
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const [error, setError] = useState("");
  const [location, setLocation] = useState(() => `${window.location.pathname}${window.location.search}`);

  const navigate = useCallback((href: string, replace = false) => {
    const next = new URL(href, window.location.origin);
    const nextLocation = `${next.pathname}${next.search}`;
    const currentLocation = `${window.location.pathname}${window.location.search}`;
    if (next.origin !== window.location.origin) {
      window.location.assign(next.href);
      return;
    }
    if (nextLocation === currentLocation) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", nextLocation);
    setLocation(nextLocation);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const handlePopState = () => setLocation(`${window.location.pathname}${window.location.search}`);
    const handleLinkClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!target || target.target || target.download || target.dataset.fullReload === "true") return;
      const next = new URL(target.href, window.location.origin);
      if (next.origin !== window.location.origin || !next.pathname.startsWith("/tutorials/")) return;
      event.preventDefault();
      navigate(`${next.pathname}${next.search}${next.hash}`);
    };
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleLinkClick);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleLinkClick);
    };
  }, [navigate]);

  useEffect(() => {
    fetch("/tutorial-api/bootstrap", { cache: "no-store" }).then(async (response) => {
      if (response.status === 401) { setUnauthorized(true); return; }
      const result = await readJson<Bootstrap & { error?: string }>(response, "服务器返回了无效响应");
      if (!response.ok) throw new Error(result.error || "加载失败");
      setBootstrap(result);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "加载失败"));
  }, []);
  const saveReviewState = useCallback((nextState: TutorialCaseState) => {
    setBootstrap((current) => {
      if (!current) return current;
      const exists = current.states.some((state) => state.id === nextState.id);
      return {
        ...current,
        states: exists
          ? current.states.map((state) => state.id === nextState.id ? nextState : state)
          : [...current.states, nextState],
      };
    });
  }, []);
  if (unauthorized) return <LoginPage />;
  if (error) return <LoadingPage message={error} />;
  if (!bootstrap) return <LoadingPage />;
  if (new URL(location, window.location.origin).pathname === "/tutorials/login") {
    return <RouteRedirect to="/tutorials/one-shanten/initial" navigate={navigate} />;
  }
  return <ReviewApp bootstrap={bootstrap} location={location} navigate={navigate} onReviewSaved={saveReviewState} />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
