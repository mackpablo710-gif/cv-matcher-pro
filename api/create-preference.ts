import type { VercelRequest, VercelResponse } from '@vercel/node';
import { MercadoPagoConfig, Preference } from 'mercadopago';
import { createClient } from '@supabase/supabase-js';

// Supabase service role — backend only, never exposed to frontend
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

const APP_URL = 'https://www.cvjob.cl';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { package_id, user_id } = req.body;
  if (!package_id || !user_id) return res.status(400).json({ error: 'Missing params' });

  // Verify user exists in our DB before creating payment
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', user_id)
    .single();

  if (profileErr || !profile) return res.status(403).json({ error: 'User not found' });

  // Get package from DB (never trust client-sent prices)
  const { data: pkg, error: pkgErr } = await supabase
    .from('packages')
    .select('*')
    .eq('id', package_id)
    .eq('active', true)
    .single();

  if (pkgErr || !pkg) return res.status(404).json({ error: 'Package not found' });

  try {
    const preference = new Preference(mp);
    const result = await preference.create({
      body: {
        items: [{
          id: pkg.id,
          title: `CV Matcher Pro — ${pkg.name}`,
          description: `${pkg.credits} adaptaciones de CV con IA`,
          quantity: 1,
          unit_price: pkg.price,
          currency_id: 'CLP',
        }],
        payer: {
          email: profile.email,
          name: profile.full_name || undefined,
        },
        external_reference: `${user_id}::${pkg.id}::${Date.now()}`,
        back_urls: {
          success: `${APP_URL}?payment=success`,
          failure: `${APP_URL}?payment=failure`,
          pending: `${APP_URL}?payment=pending`,
        },
        auto_return: 'approved',
        notification_url: `https://www.cvjob.cl/api/mp-webhook`,
        statement_descriptor: 'CVJOB.CL',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 min
      },
    });

    // Store pending purchase in DB
    await supabase.from('purchases').insert({
      user_id,
      package_id: pkg.id,
      credits: pkg.credits,
      price: pkg.price,
      mp_preference_id: result.id,
      status: 'pending',
      note: 'Mercado Pago',
    });

    return res.status(200).json({ init_point: result.init_point });
  } catch (err: any) {
    console.error('MP preference error:', err);
    return res.status(500).json({ error: 'Payment setup failed' });
  }
}
