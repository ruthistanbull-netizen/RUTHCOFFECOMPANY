-- Align the canonical ROSTA product media bucket with current Ruth Commerce media behavior.
-- Use the Storage service/global object-size limit instead of a lower bucket-specific 15 MB cap,
-- and allow MOV/QuickTime videos accepted by the admin media uploader.

update storage.buckets
set
  public = true,
  file_size_limit = null,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
where id = 'rosta-media';
