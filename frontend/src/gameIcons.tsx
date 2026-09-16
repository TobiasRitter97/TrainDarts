// Icon-Zuordnung fuer den Game Hub (Redesign 16.09.2026): ersetzt die
// bisherigen Emoji-Icons (staticGames.ts "icon"-Feld) durch ein
// einheitliches Lucide-Set, wie von Tobias gefordert ("keine Emojis in
// der finalen UI"). Das "icon"-Feld in staticGames.ts bleibt unveraendert
// bestehen (fuer evtl. andere Verwendung/Abwaertskompatibilitaet) - der
// Game Hub nutzt ab jetzt ausschliesslich diese Zuordnung.
import {
  BarChart3,
  Clock,
  Crosshair,
  Dice5,
  Globe,
  Hash,
  LucideIcon,
  Ruler,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { GameDefinition } from "./api";

const GAME_ICON_BY_ID: Record<string, LucideIcon> = {
  "170": Target,
  random_checkout: Dice5,
  "121": Hash,
  bobs27: Users,
  bobs27_easy: Users,
  catch40_easy: Crosshair,
  catch40: Crosshair,
  "60plusminus": BarChart3,
  around_the_world: Globe,
  jdc: Trophy,
  grouping_championship: Ruler,
};

export function gameIcon(game: GameDefinition): LucideIcon {
  return GAME_ICON_BY_ID[game.id] ?? Clock;
}
