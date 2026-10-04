import type { Metadata } from "next";
import { VerifyForm } from "@/components/VerifyForm";

export const metadata: Metadata = {
  title: "Verify a text",
  description: "Paste any text to see whether it was written and sealed in Crest.",
};

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-14 sm:px-6 sm:pt-20">
      <div className="label">For teachers, editors & hiring managers</div>
      <h1 className="display mt-3 text-[56px] sm:text-[84px]">
        Did a human <em>write this?</em>
      </h1>
      <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-ink-2">
        Crest doesn&apos;t guess like an AI detector. Paste the text, and if it was written in Crest you&apos;ll get the
        signed record: who sealed it, how long it took, and a keystroke replay.
      </p>
      <div className="mt-10">
        <VerifyForm />
      </div>
    </div>
  );
}
