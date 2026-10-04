"use client";

import { useState } from "react";

export function EmbedBox({ slug, site, label }: { slug: string; site: string; label: string }) {
  const url = `${site}/c/${slug}`;
  const badge = `${site}/api/badge/${slug}`;
  const alt = `${label}: verified by Crest`;
  const formats = {
    HTML: `<a href="${url}"><img src="${badge}" alt="${alt}" height="52"></a>`,
    Markdown: `[![${alt}](${badge})](${url})`,
    Link: url,
  };
  const [fmt, setFmt] = useState<keyof typeof formats>("HTML");
  const [copied, setCopied] = useState(false);

  return (
    <div className="card p-6">
      <div className="label">Wear it</div>
      <h3 className="display mt-1 text-[32px]">Embed the badge</h3>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/badge/${slug}`} alt="Crest badge" width={268} height={52} className="mt-4" />
      <div className="mt-5 flex gap-1 rounded-full bg-paper-2 p-1 text-[12px]">
        {(Object.keys(formats) as (keyof typeof formats)[]).map((k) => (
          <button
            key={k}
            onClick={() => setFmt(k)}
            className={`flex-1 rounded-full py-1.5 ${fmt === k ? "bg-card text-ink shadow-sm" : "text-ink-3"}`}
          >
            {k}
          </button>
        ))}
      </div>
      <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-paper-2 p-3 font-mono text-[11.5px] text-ink-2">
        {formats[fmt]}
      </pre>
      <button
        className="btn btn-ghost mt-3 w-full justify-center"
        onClick={async () => {
          await navigator.clipboard.writeText(formats[fmt]);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied ✓" : "Copy snippet"}
      </button>
    </div>
  );
}
