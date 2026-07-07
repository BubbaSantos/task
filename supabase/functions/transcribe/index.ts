import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const form = await req.formData();
    const audio = form.get('audio') as File | null;
    if (!audio) return new Response(JSON.stringify({ error: 'no audio' }), { status: 400, headers: CORS });

    const groqForm = new FormData();
    groqForm.append('file', audio, audio.name || 'audio.webm');
    groqForm.append('model', 'whisper-large-v3-turbo');
    groqForm.append('response_format', 'json');

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}` },
      body: groqForm,
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message ?? `Groq ${res.status}`);

    return new Response(JSON.stringify({ text: data.text ?? '' }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
