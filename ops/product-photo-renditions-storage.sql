-- Run manually on each brand's SELF-HOSTED database before deploying the
-- photo-rendition API. This changes only an existing product-media bucket.
-- A NULL allowlist already permits all MIME types and is left unchanged.
begin;

update storage.buckets as bucket
set allowed_mime_types = array(
  select distinct mime
  from unnest(bucket.allowed_mime_types || array['application/json', 'image/gif']::text[]) as mime
  order by mime
)
where bucket.id in ('ruth-commerce-product-photos', 'rosta-media')
  and bucket.allowed_mime_types is not null;

select id, allowed_mime_types
from storage.buckets
where id in ('ruth-commerce-product-photos', 'rosta-media');

commit;
