-- Public merchandise photos only. No customer documents or private receipts here.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('product-images','product-images',true,2097152,ARRAY['image/webp'])
ON CONFLICT(id) DO UPDATE SET file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Upload authorization comes from short-lived signed URLs issued after admin auth.
-- No general browser INSERT/UPDATE/DELETE policy is granted.
