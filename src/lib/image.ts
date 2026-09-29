/**
 * Re-encode a photo through a canvas before it's uploaded to the public CDN.
 * Phone photos carry EXIF (GPS coordinates, device, time); a canvas only keeps
 * pixels, so the re-encoded file has none of it. createImageBitmap applies the
 * EXIF orientation first, so the photo still displays the right way up.
 *
 * Throws rather than falling back to the original: uploading the untouched
 * file on failure would publish exactly the location data this exists to drop.
 */
export async function stripImageMetadata(file: Blob): Promise<Blob> {
  const type = ["image/png", "image/webp"].includes(file.type) ? file.type : "image/jpeg";
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
    if (!out) throw new Error("Couldn't process that photo — try another one.");
    return out;
  } finally {
    bitmap.close();
  }
}
