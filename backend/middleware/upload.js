const multer = require('multer');
const crypto = require('crypto');
const storage = require('../services/storage');

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

/**
 * Multipart upload of a single file into storage. `.single(field)` returns middleware that validates the file, saves
 * it under a random name and sets `req.file.filename` (and `req.file.visibility`) for the route.
 */
function createUploader({ types, prefix, maxBytes, visibility }) {
  const parser = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 10 },
    fileFilter: (req, file, cb) => {
      if (types[file.mimetype]) return cb(null, true);
      const err = new Error(`Unsupported file type: ${file.mimetype}`);
      err.status = 400;
      cb(err);
    },
  });

  const persist = async (req, res, next) => {
    if (!req.file) return next();
    try {
      // Never trust the client filename: random name + extension derived from the validated mimetype.
      const name = `${prefix}${Date.now()}_${crypto.randomBytes(8).toString('hex')}${types[req.file.mimetype]}`;
      await storage.save(visibility, name, req.file.buffer, req.file.mimetype);
      req.file.filename = name;
      req.file.visibility = visibility;
      delete req.file.buffer;
      next();
    } catch (err) {
      next(err);
    }
  };

  return { single: (field) => [parser.single(field), persist] };
}

const MB = 1024 * 1024;
const uploadImage = createUploader({ types: IMAGE_TYPES, prefix: '', maxBytes: 8 * MB, visibility: 'public' });
const uploadSlip = createUploader({ types: RECEIPT_TYPES, prefix: 'receipt_', maxBytes: 10 * MB, visibility: 'private' });
const uploadChatImage = createUploader({ types: IMAGE_TYPES, prefix: 'chat_', maxBytes: 8 * MB, visibility: 'private' });
const uploadVoice = createUploader({ types: AUDIO_TYPES, prefix: 'voice_', maxBytes: 10 * MB, visibility: 'private' });
const uploadRequestPhoto = createUploader({ types: IMAGE_TYPES, prefix: 'photo_', maxBytes: 8 * MB, visibility: 'private' });

/** Deletes an uploaded file when the request that carried it is rejected. */
function discardUpload(file) {
  if (file?.filename && file.visibility) storage.remove(file.visibility, file.filename).catch(() => {});
}

module.exports = {
  UPLOAD_DIR: storage.UPLOAD_DIR,
  PRIVATE_UPLOAD_DIR: storage.PRIVATE_UPLOAD_DIR,
  uploadImage,
  uploadSlip,
  uploadChatImage,
  uploadVoice,
  uploadRequestPhoto,
  discardUpload,
};
