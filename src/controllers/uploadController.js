// src/controllers/uploadController.js
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from "crypto";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

function randomFileName(origName) {
  const ext = (origName && origName.includes(".")) ? origName.split(".").pop() : "";
  const id = crypto.randomBytes(12).toString("hex");
  return ext ? `${id}.${ext}` : id;
}

/**
 * POST /api/upload/presign
 * body: { filename?: string, contentType: "image/png", folder?: "topics/42" }
 * returns: { uploadUrl, publicUrl, key }
 */
export const presignForUpload = async (req, res) => {
  try {
    const { filename, contentType, folder } = req.body || {};
    if (!contentType) return res.status(400).json({ message: "contentType required" });

    const bucket = process.env.S3_BUCKET;
    if (!bucket) return res.status(500).json({ message: "S3 bucket not configured" });

    const fname = filename ? filename.replace(/\s+/g, "_") : randomFileName(filename);
    const key = (folder ? `${folder.replace(/^\/+|\/+$/g, "")}/` : "") + fname;

    // optional metadata and ACL here; we rely on bucket policy/CloudFront for public access
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
      // ACL: "public-read", // avoid; use bucket policy or CloudFront
      CacheControl: "public, max-age=31536000, immutable"
    });

    // presigned url valid for N seconds (e.g., 300)
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });

    // public URL (if objects are public or via CloudFront)
    let publicUrl;
    if (process.env.CLOUDFRONT_DOMAIN) {
      publicUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${key}`;
    } else {
      publicUrl = `https://${bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    }

    return res.json({ uploadUrl: signedUrl, publicUrl, key });
  } catch (err) {
    console.error("presignForUpload error:", err);
    return res.status(500).json({ message: "Failed to generate presigned url" });
  }
};
