/**
 * Chess API client — thin wrapper around fetch for /api/v1/chess/ endpoints.
 */

const API =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/v1/chess`
    : "/api/v1/chess";

export type GameState = {
  id: string;
  variant: string;
  player_white: string;
  player_black: string;
  fen: string;
  status: string;
  turn: string;
  move_history: string[];
  legal_moves: string[];
  captured_white: string[];
  captured_black: string[];
};

export type MoveResult = {
  game: GameState;
  captured: string | null;
  is_check: boolean;
  is_checkmate: boolean;
};

export async function createGame(
  variant = "STANDARD",
  playerWhite = "",
  playerBlack = ""
): Promise<GameState> {
  const res = await fetch(`${API}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      variant,
      player_white: playerWhite,
      player_black: playerBlack,
    }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? `${res.status}`);
  return res.json();
}

export async function getGame(id: string): Promise<GameState> {
  const res = await fetch(`${API}/games/${id}`);
  if (!res.ok) throw new Error((await res.json()).detail ?? `${res.status}`);
  return res.json();
}

export async function makeMove(
  gameId: string,
  uci: string
): Promise<MoveResult> {
  const res = await fetch(`${API}/games/${gameId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uci }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? `${res.status}`);
  return res.json();
}

export async function resignGame(
  gameId: string,
  color: "WHITE" | "BLACK"
): Promise<GameState> {
  const res = await fetch(`${API}/games/${gameId}/resign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ color }),
  });
  if (!res.ok) throw new Error((await res.json()).detail ?? `${res.status}`);
  return res.json();
}

