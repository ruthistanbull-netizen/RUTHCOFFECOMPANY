#!/usr/bin/env python3
"""Read-only diagnostic for ROSTA self-hosted Supabase media. Ruth is never accessed."""
import json
import subprocess
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

SQL = r"""
SELECT json_build_object(
 'storage_metadata', (SELECT count(*) FROM storage.objects WHERE bucket_id IN ('rosta-media','website-media')),
 'legacy_product_images', (SELECT count(*) FROM public.product_images WHERE image_url ILIKE '%fposvxuryzidmeuwytbg.supabase.co%'),
 'legacy_main_images', (SELECT count(*) FROM public.products WHERE main_image_url ILIKE '%fposvxuryzidmeuwytbg.supabase.co%'),
 'legacy_collection_covers', (SELECT count(*) FROM public.collections WHERE cover_image_url ILIKE '%fposvxuryzidmeuwytbg.supabase.co%'),
 'legacy_site_settings', (SELECT count(*) FROM public.site_settings WHERE setting_value::text ILIKE '%fposvxuryzidmeuwytbg.supabase.co%'),
 'sample', (
    SELECT coalesce(json_agg(row_to_json(media)), '[]'::json)
    FROM (
      SELECT bucket_id, name FROM storage.objects
      WHERE bucket_id IN ('rosta-media','website-media')
        AND name ~* '\.(jpg|jpeg|png|webp|avif)$'
      ORDER BY created_at DESC LIMIT 6
    ) AS media
 )
)::text;
"""
def main():
    proc = subprocess.run(
        ["sudo", "docker", "exec", "rosta-db", "sh", "-c",
         'PGPASSWORD="$POSTGRES_PASSWORD" psql -X -qAt -U postgres -d postgres -c "$1"', "sh", SQL],
        capture_output=True, text=True, timeout=30,
    )
    if proc.returncode:
        raise SystemExit("ROSTA veritabanı okunamadı; Ruth'a erişilmedi. " + proc.stderr[:160])
    try:
        result = json.loads(proc.stdout.strip())
    except ValueError:
        raise SystemExit("ROSTA sonuçları JSON biçiminde okunamadı.")
    for key in ["storage_metadata", "legacy_product_images", "legacy_main_images", "legacy_collection_covers", "legacy_site_settings"]:
        print(key + ":", result.get(key))
    print("ROSTA public Storage dosya testi (yalnızca HTTP kodları):")
    for item in result.get("sample", []):
        url = ("http://127.0.0.1:18000/storage/v1/object/public/"
               + quote(item["bucket_id"], safe="") + "/" + quote(item["name"], safe="/"))
        try:
            with urlopen(Request(url, headers={"Range": "bytes=0-0"}), timeout=12) as response:
                code = response.status
        except HTTPError as error:
            code = error.code
        except (URLError, TimeoutError):
            code = "CONNECTION_ERROR"
        print(item["bucket_id"], code, "(public image check)")
    print("Yalnızca ROSTA okundu; veritabanı ve dosyalar değiştirilmedi.")
if __name__ == "__main__":
    main()
