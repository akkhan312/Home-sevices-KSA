const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const { authenticate } = require('../middleware/auth');

// POST /api/favorites/:providerId — toggle favorite (add or remove)
router.post('/:providerId', authenticate, async (req, res) => {
  try {
    const customerId = req.user.id;
    const { providerId } = req.params;

    if (req.user.role !== 'customer') {
      return res.status(403).json({ error: 'Only customers can save favorites' });
    }

    // Check if already favorited
    const { data: existing } = await supabase
      .from('favorites')
      .select('id')
      .eq('customer_id', customerId)
      .eq('provider_id', providerId)
      .single();

    if (existing) {
      // Remove favorite
      await supabase.from('favorites').delete().eq('id', existing.id);
      return res.json({ favorited: false, message: 'Removed from favorites' });
    }

    // Add favorite
    await supabase.from('favorites').insert({ customer_id: customerId, provider_id: providerId });
    res.json({ favorited: true, message: 'Added to favorites' });
  } catch (err) {
    console.error('POST /favorites error:', err);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

// GET /api/favorites — customer's favorite providers
router.get('/', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'customer') {
      return res.status(403).json({ error: 'Only customers can view favorites' });
    }

    const { data: favorites, error } = await supabase
      .from('favorites')
      .select('id, provider_id, created_at')
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with provider details
    const enriched = await Promise.all(
      (favorites || []).map(async (f) => {
        const { data: provider } = await supabase
          .from('users')
          .select('id, name, profile_picture, rating, review_count, completed_jobs, city, service_areas, service_categories, service_prices, is_available, iqama_number, approval_status')
          .eq('id', f.provider_id)
          .maybeSingle();
        if (!provider) return { ...f, provider: null };
        // Same public shape as GET /api/providers (verification is derived, the Iqama number never leaves the server).
        const { iqama_number, approval_status, ...publicFields } = provider;
        return { ...f, provider: { ...publicFields, verified: Boolean(iqama_number) && (approval_status || 'APPROVED') === 'APPROVED' } };
      })
    );

    res.json(enriched.filter(f => f.provider));
  } catch (err) {
    console.error('GET /favorites error:', err);
    res.status(500).json({ error: 'Failed to fetch favorites' });
  }
});

// GET /api/favorites/check/:providerId — check if provider is favorited
router.get('/check/:providerId', authenticate, async (req, res) => {
  try {
    const { data } = await supabase
      .from('favorites')
      .select('id')
      .eq('customer_id', req.user.id)
      .eq('provider_id', req.params.providerId)
      .single();

    res.json({ favorited: !!data });
  } catch {
    res.json({ favorited: false });
  }
});

module.exports = router;
