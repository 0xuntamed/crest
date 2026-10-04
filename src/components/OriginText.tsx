import type { ReactNode } from "react";

/** Renders text with one span per run of identical origin. Typed text is left plain. */
export function OriginText({
  content,
  origins,
  highlight,
  caretAt,
}: {
  content: string;
  origins: string;
  highlight: boolean;
  caretAt?: number;
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
          <span key={key++} className={o === "p" ? "o-p" : "o-o"} title={o === "p" ? "pasted" : "undo / autocorrect"}>
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
