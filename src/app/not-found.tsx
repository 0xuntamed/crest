import Link from "next/link";
import { Seal } from "@/components/Seal";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 pt-24 text-center">
      <Seal hash="404404404404404404404404404404404404404404404404404404404404404a" tier="assembled" size={120} ring={false} />
      <h1 className="display mt-8 text-[64px]">No record of that.</h1>
      <p className="mt-3 text-ink-2">This page, draft or crest doesn&apos;t exist, or it belongs to another browser.</p>
      <Link href="/" className="btn btn-ghost mt-8">Back home</Link>
    </div>
  );
}
