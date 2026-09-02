type Props = {
  round: number;
  legNumber: number | null;
  setNumber: number | null;
};

// SPEC §12/§17: Rundenanzeige aus der echten Game Engine. Set-Nummer
// nur, wenn bei 170 "Sets aktivieren" eingeschaltet ist.
export function GameProgress({ round, legNumber, setNumber }: Props) {
  return (
    <div className="game-progress">
      ROUND {round}
      {setNumber !== null && ` · SET ${setNumber}`}
      {legNumber !== null && ` · LEG ${legNumber}`}
    </div>
  );
}
