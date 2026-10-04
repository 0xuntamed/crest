import type { ReactNode } from "react";

/** Renders text with one span per run of identical origin. Typed text is left plain. */
const TITLES: Record<string, string> = { p: "pasted", o: "undo / autocorrect", u: "unaccounted" };
const CLASSES: Record<string, string> = { p: "o-p", o: "o-o", u: "o-u" };

export function OriginText({
  content,
  origins,
  highlight,
  caretAt,
  titles = TITLES,
}: {
  content: string;
  origins: string;
  highlight: boolean;
  caretAt?: number;
  titles?: Record<string, string>;
}) {
  const out: ReactNode[] = [];
  let key = 0;

  const runs = (from: number, to: number) => {
    let i = from;
    while (i < to) {
      const o = origins[i] ?? "t";
      let j = i + 1;
      while (j < to && (origins[j] ?? "t") === o) j++;
      const text = content.slice(i, j);
      if (!highlight || o === "t") out.push(<span key={key++}>{text}</span>);
      else
        out.push(
          <span key={key++} className={CLASSES[o] ?? "o-o"} title={titles[o] ?? TITLES[o]}>
            {text}
          </span>,
        );
      i = j;
    }
  };

  if (caretAt === undefined) {
    runs(0, content.length);
  } else {
    const c = Math.min(Math.max(0, caretAt), content.length);
    runs(0, c);
    out.push(<span key={key++} className="caret" aria-hidden />);
    runs(c, content.length);
  }
  return <>{out}</>;
}
