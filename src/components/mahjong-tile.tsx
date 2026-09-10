import { tileImagePath, tileLabel } from "@/domain/mahjong-tiles";

export function MahjongTile({
  tile,
  size = "hand",
  sideways = false,
  muted = false,
  dimmed = false,
}: {
  tile: string;
  size?: "hand" | "compact" | "choice" | "river" | "dora" | "meld";
  sideways?: boolean;
  muted?: boolean;
  dimmed?: boolean;
}) {
  const tileElement = (
    <span
      className={`mahjong-tile mahjong-tile-${size}${sideways ? " rotated" : ""}${muted ? " muted" : ""}${dimmed ? " dimmed" : ""}`}
      title={`${tile} · ${tileLabel(tile)}`}
    >
      <img src={tileImagePath(tile)} alt={tileLabel(tile)} draggable={false} />
    </span>
  );
  if (!sideways) return tileElement;
  return <span className={`mahjong-tile-sideways-slot mahjong-tile-sideways-slot-${size}`}>{tileElement}</span>;
}

export function MahjongBack({ compact = false, meld = false }: { compact?: boolean; meld?: boolean }) {
  return <span className={`mahjong-back${compact ? " compact" : ""}${meld ? " meld" : ""}`} aria-hidden="true"><i /></span>;
}

export function MahjongHand({ tiles, compact = false, drawnTile }: { tiles: string[]; compact?: boolean; drawnTile?: string }) {
  const concealedTiles = [...tiles];
  const drawnTileIndex = drawnTile ? concealedTiles.lastIndexOf(drawnTile) : -1;
  const separatedDrawnTile = drawnTileIndex >= 0 ? concealedTiles.splice(drawnTileIndex, 1)[0] : null;
  return (
    <div className={`mahjong-hand${compact ? " compact" : ""}`} aria-label={`手牌 ${tiles.join(" ")}`}>
      {concealedTiles.map((tile, index) => <MahjongTile tile={tile} size={compact ? "compact" : "hand"} key={`${tile}-${index}`} />)}
      {separatedDrawnTile && <span className={`mahjong-drawn-tile${compact ? " compact" : ""}`}><MahjongTile tile={separatedDrawnTile} size={compact ? "compact" : "hand"} /></span>}
    </div>
  );
}

type Meld = {
  type: "chi" | "pon" | "daiminkan" | "ankan" | "kakan";
  tiles: string[];
  calledIndex: number | null;
  addedTile: string | null;
};

export function MahjongMeld({ meld }: { meld: Meld }) {
  return (
    <div className={`mahjong-meld meld-${meld.type}`}>
      {meld.tiles.map((tile, index) => {
        if (meld.type === "ankan" && (index === 0 || index === meld.tiles.length - 1)) {
          return <MahjongBack meld key={`${tile}-${index}`} />;
        }
        if (index === meld.calledIndex && meld.addedTile) {
          return (
            <span className="mahjong-meld-stack" key={`${tile}-${index}`}>
              <MahjongTile tile={tile} size="meld" sideways />
              <span className="mahjong-meld-added"><MahjongTile tile={meld.addedTile} size="meld" sideways /></span>
            </span>
          );
        }
        return <MahjongTile tile={tile} size="meld" sideways={index === meld.calledIndex} key={`${tile}-${index}`} />;
      })}
    </div>
  );
}

export function MahjongMelds({ melds }: { melds: Meld[] }) {
  return <div className="mahjong-melds">{melds.map((meld, index) => <MahjongMeld meld={meld} key={`${meld.type}-${index}`} />)}</div>;
}
