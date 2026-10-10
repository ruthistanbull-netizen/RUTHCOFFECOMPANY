#!/usr/bin/env python3
"""Read-only ROSTA media/catalog and public HTTP checks. Never connects to Ruth."""
import json
import subprocess
from urllib.parse import quote
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

sql = r"""
SELECT json_build_object(
  'products_total', (SELECT count(*) FROM public.products),
  'products_active', (SELECT count(*) FROM public.products WHERE status='active'),
  'products_with_main_image', (SELECT count(*) FROM public.products WHERE nullif(main_image_url,'') IS NOT NULL),
  'product_image_rows', (SELECT count(*) FROM public.product_images),
  'product_image_old_cloud', (SELECT count(*) FROM public.product_images WHERE image_url LIKE '%fposvxuryzidmeuwytbg.supabase.co%'),
  'main_image_old_cloud', (SELECT count(*) FROM public.products WHERE main_image_url LIKE '%fposvxuryzidmeuwytbg.supabase.co%'),
  'collections_total', (SELECT count(*) FROM public.collections),
  'collections_with_cover', (SELECT count(*) FROM public.collections WHERE nullif(cover_image_url,'') IS NOT NULL),
  'theme_customizer_rows', (SELECT count(*) FROM public.site_settings WHERE setting_key='theme_customizer'),
  'published_design_rows', (SELECT count(*) FROM public.site_settings WHERE setting_key='store_design_v2_published'),
  'theme_cloud_refs', (SELECT count(*) FROM public.site_settings WHERE setting_value::text LIKE '%fposvxuryzidmeuwytbg.supabase.co%'),
  'storage_media_count', (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('rosta-media','website-media')),
  'sample', (SELECT row_to_json(s) FROM (
    SELECT bucket_id,name FROM storage.objects
    WHERE bucket_id IN ('rosta-media','website-media') AND name ~* '\.(jpe?g|png|webp|avif)$'
    ORDER BY created_at DESC LIMIT 1
  ) s)
)::text;
"""
result = subprocess.run(
    ['sudo','docker','exec','rosta-db','sh','-c',
     'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -qAt -U postgres -d postgres -c "$1"',
     'sh',sql],
    capture_output=True,text=True,timeout=35,
)
if result.returncode != 0:
    print("ROSTA-only database query failed; no data modified. Error:", result.stderr[-300:])
    raise SystemExit(1)
try:
    data = json.loads(result.stdout.strip())
except Exception:
    print("ROSTA database results could not be parsed.")
    raise SystemExit(1)

for label in [
  'products_total','products_active','products_with_main_image',
  'product_image_rows','product_image_old_cloud','main_image_old_cloud',
  'collections_total','collections_with_cover','theme_customizer_rows',
  'published_design_rows','theme_cloud_refs','storage_media_count'
]:
    print(f"{label}: {data.get(label)}")

sample = data.get('sample')
if sample:
    print("Public ROSTA media origin checks (HTTP code + content type only):")
    path = '/storage/v1/object/public/' + quote(sample['bucket_id'],safe='') + '/' + quote(sample['name'],safe='/')
    for origin in [
        'http://127.0.0.1:18000',
        'https://rosta-supabase.tail178b60.ts.net',
        'https://rostacoffee.57.131.148.71.sslip.io',
    ]:
        req = Request(origin+path, headers={'Range':'bytes=0-0','Origin':'https://rostacoffecompany.zeabur.app','User-Agent':'ROSTA-readonly-diagnostic'})
        try:
            with urlopen(req,timeout=13) as response:
                status = response.status
                content_type = response.headers.get('Content-Type','')[:60]
        except HTTPError as e:
            status = e.code
            content_type = (e.headers.get('Content-Type') or '')[:60]
        except (URLError,TimeoutError,OSError) as e:
            status = type(e).__name__
            content_type = 'connection failed'
        print(origin, 'HTTP:', status, 'TYPE:', content_type)
else:
    print("No sample public image metadata found.")
print("ROSTA only; no database rows or media files modified; Ruth never accessed.")
