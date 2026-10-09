"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteDraftButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <button
      className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] transition ${confirm ? "bg-wax text-wax-ink" : "text-ink-3 opacity-0 hover:bg-paper-2 group-hover:opacity-100 focus:opacity-100"}`}
      onBlur={() => setConfirm(false)}
      onClick={async () => {
        if (!confirm) return setConfirm(true);
        await fetch(`/api/drafts/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      {confirm ? "Delete forever?" : "Delete"}
    </button>
  );
}
