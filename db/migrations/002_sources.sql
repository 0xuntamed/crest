-- Where a draft is written: the Crest editor, or Google Docs via the browser extension.
alter table drafts add column if not exists source text not null default 'crest' check (source in ('crest', 'gdocs'));
alter table drafts add column if not exists source_ref text;       -- Google Doc id
alter table crests add column if not exists source text not null default 'crest' check (source in ('crest', 'gdocs'));
alter table crests add column if not exists source_ref text;

create index if not exists drafts_source_ref_idx on drafts(author_id, source_ref) where source_ref is not null;
