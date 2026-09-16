const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '..', 'uploads');
// Receipts and chat media live outside the statically served folder.
const PRIVATE_UPLOAD_DIR = path.join(UPLOAD_DIR, 'private');
for (const dir of [UPLOAD_DIR, PRIVATE_UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const IMAGE_TYPES = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

const AUDIO_TYPES = {
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/3gpp': '.3gp',
};

const RECEIPT_TYPES = { ...IMAGE_TYPES, 'application/pdf': '.pdf' };

function createUploader({ types, prefix, maxBytes, dir }) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, dir),
      // Never trust the client filename: random name + extension derived from the validated mimetype.
      filename: (req, file, cb) => cb(null, `${prefix}${Date.now()}_${crypto.randomBytes(8).toString('hex')}${types[file.mimetype]}`),
    }),
    limits: { fileSize: maxBytes, files: 1, fields: 10 },
    fileFilter: (req, file, cb) => {
      if (types[file.mimetype]) return cb(null, true);
      const err = new Error(`Unsupported file type: ${file.mimetype}`);
      err.status = 400;
      cb(err);
    },
  });
}

const uploadImage = createUploader({ types: IMAGE_TYPES, prefix: '', maxBytes: 8 * 1024 * 1024, dir: UPLOAD_DIR });
const uploadSlip = createUploader({ types: RECEIPT_TYPES, prefix: 'receipt_', maxBytes: 10 * 1024 * 1024, dir: PRIVATE_UPLOAD_DIR });
const uploadChatImage = createUploader({ types: IMAGE_TYPES, prefix: 'chat_', maxBytes: 8 * 1024 * 1024, dir: PRIVATE_UPLOAD_DIR });
const uploadVoice = createUploader({ types: AUDIO_TYPES, prefix: 'voice_', maxBytes: 10 * 1024 * 1024, dir: PRIVATE_UPLOAD_DIR });

/** Deletes an uploaded file when the request that carried it is rejected. */
function discardUpload(file) {
  if (file?.path) fs.promises.unlink(file.path).catch(() => {});
}

module.exports = { UPLOAD_DIR, PRIVATE_UPLOAD_DIR, uploadImage, uploadSlip, uploadChatImage, uploadVoice, discardUpload };
