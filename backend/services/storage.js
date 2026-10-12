// Where uploaded files live: the local disk (default) or a Supabase Storage bucket (STORAGE_DRIVER=supabase), so the
// API can run on hosts without a persistent disk. Files are always served through the API, which keeps the access
// rules (public profile photos, signed URLs for receipts and chat media) identical for both drivers.
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

const UPLOAD_DIR = process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : path.join(__dirname, '..', 'uploads');
const PRIVATE_UPLOAD_DIR = path.join(UPLOAD_DIR, 'private');

/** visibility is 'public' (profile photos) or 'private' (receipts, chat media, request photos). */
function createLocalDriver() {
  for (const dir of [UPLOAD_DIR, PRIVATE_UPLOAD_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
  const fullPath = (visibility, name) => path.join(visibility === 'private' ? PRIVATE_UPLOAD_DIR : UPLOAD_DIR, path.basename(name));
  return {
    name: 'local',
    async save(visibility, name, buffer) {
      await fs.promises.writeFile(fullPath(visibility, name), buffer);
    },
    async open(visibility, name) {
      const file = fullPath(visibility, name);
      try {
        await fs.promises.access(file);
      } catch {
        return null;
      }
      return fs.createReadStream(file);
    },
    async remove(visibility, name) {
      await fs.promises.unlink(fullPath(visibility, name)).catch(() => {});
    },
  };
}

function createSupabaseDriver(client, bucket) {
  const objectKey = (visibility, name) => `${visibility === 'private' ? 'private' : 'public'}/${path.basename(name)}`;
  const store = () => client.storage.from(bucket);
  return {
    name: 'supabase',
    async save(visibility, name, buffer, contentType) {
      const { error } = await store().upload(objectKey(visibility, name), buffer, { contentType, upsert: false });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
    },
    async open(visibility, name) {
      const { data, error } = await store().download(objectKey(visibility, name));
      if (error || !data) return null;
      return Readable.from(Buffer.from(await data.arrayBuffer()));
    },
    async remove(visibility, name) {
      const { error } = await store().remove([objectKey(visibility, name)]);
      if (error) console.warn('Storage delete failed:', error.message);
    },
  };
}

function createDriver() {
  if ((process.env.STORAGE_DRIVER || 'local').toLowerCase() === 'supabase') {
    return createSupabaseDriver(require('../supabase'), process.env.SUPABASE_STORAGE_BUCKET || 'servehome-uploads');
  }
  return createLocalDriver();
}

let driver = createDriver();

module.exports = {
  UPLOAD_DIR,
  PRIVATE_UPLOAD_DIR,
  createLocalDriver,
  createSupabaseDriver,
  save: (...args) => driver.save(...args),
  open: (...args) => driver.open(...args),
  remove: (...args) => driver.remove(...args),
  driverName: () => driver.name,
  setDriver: (next) => { driver = next; },
};
