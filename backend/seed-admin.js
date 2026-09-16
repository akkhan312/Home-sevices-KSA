// Creates or promotes the platform admin account from environment variables.
// Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... [ADMIN_NAME=...] [ADMIN_PHONE=...] npm run seed
require('./config');
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD || '';
  const name = process.env.ADMIN_NAME || 'Platform Admin';
  const phone = process.env.ADMIN_PHONE || '';

  if (!email || password.length < 12) {
    console.error('❌ Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) before running the seed.');
    process.exit(1);
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const { data: existingUser, error: fetchError } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (fetchError) throw fetchError;

    if (existingUser) {
      const { error } = await supabase
        .from('users')
        .update({ password: hashedPassword, role: 'admin', name, ...(phone ? { phone } : {}), status: 'active', updated_at: new Date().toISOString() })
        .eq('id', existingUser.id);
      if (error) throw error;
      console.log(`✅ Existing user ${email} updated to admin.`);
    } else {
      const { error } = await supabase.from('users').insert({ email, password: hashedPassword, name, phone, role: 'admin', status: 'active' });
      if (error) throw error;
      console.log(`✅ Admin user ${email} created.`);
    }
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin user:', error.message || error);
    process.exit(1);
  }
}

seedAdmin();
