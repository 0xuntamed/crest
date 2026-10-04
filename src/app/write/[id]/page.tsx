import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentAuthor } from "@/lib/auth";
import { getDraft } from "@/lib/repo";
import { pool } from "@/lib/db";
import { Editor } from "@/components/Editor";

export const metadata: Metadata = { title: "Writing", robots: { index: false } };

export default async function WritePage(props: PageProps<"/write/[id]">) {
  const { id } = await props.params;
  const [author, draft] = await Promise.all([currentAuthor(), getDraft(id)]);
  if (!draft || !author || draft.author_id !== author.id) notFound();
  if (draft.status === "sealed") {
    const { rows } = await pool.query<{ slug: string }>("select slug from crests where draft_id = $1", [id]);
    if (rows[0]) redirect(`/c/${rows[0].slug}`);
  }
  return (
    <Editor
      draftId={draft.id}
      initial={{
        title: draft.title,
        content: draft.content,
        origins: draft.origins,
        seq: draft.seq,
        headHash: draft.head_hash,
        lastT: Number(draft.last_t),
      }}
    />
  );
}
