
CREATE POLICY "own media files" ON storage.objects FOR ALL TO authenticated
USING (bucket_id IN ('media','renders') AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id IN ('media','renders') AND (storage.foldername(name))[1] = auth.uid()::text);
