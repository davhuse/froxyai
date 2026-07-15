# Adult Provider Roadmap

Bu dosya +18 modlari icin eklenecek/tamamlanacak saglayicilari listeler.

## Adult Chat / Roleplay

- Pollinations Chat
  - Free ve hizli adult-roleplay presetleri icin ana hat.
  - Modeller: `pollinations-spicy-rp`, `pollinations-flirt`, `pollinations-romance`, `pollinations-afterdark`, `pollinations-afterdark-turbo`, `pollinations-erotic-story`, `pollinations-roleplay-uncensored`, `pollinations-flirty-chat`.

- OpenRouter
  - Adult roleplay uyumlu free/open modeller icin ana alternatif.
  - Modeller: `cognitivecomputations/dolphin-mistral-24b-venice-edition:free`, `adult-venice-uncensored-free`.

- Groq
  - Pollinations/OpenRouter hata verirse hizli fallback.
  - Adult prompt tonu system prompt ile korunur, model genel chat modeli olabilir.

- Chutes AI
  - Free quota ile yeni Llama/DeepSeek/Qwen roleplay fallbackleri.

- CometAPI
  - Multi-model fallback olarak eklenecek.

- Jan Local / Local OpenAI-Compatible
  - Kullanici lokal uncensored/roleplay modeli calistiriyorsa siteye baglanacak.
  - LM Studio, Jan, Ollama bridge gibi OpenAI-compatible endpointler hedeflenir.

## Adult Image

**Durum (2026-06): Çoğu implemented. Local'lar full explicit fictional (sex/porno) destekler (kullanıcı NSFW model ile). Shared'lar roadmap policy (suggestive only) ile.**

- Pollinations Image — **Implemented (ana free yol)**: Adult mood, sensual editorial, boudoir, lingerie, romantic intimacy için free ana hat. Suggestive/sinematik stile yönlendir (shared).
- Together AI — **Implemented**: Flux/Qwen ile kaliteli adult mood görseller (low cost / tier).
- AIML API — **Re-enabled + implemented**: Nano Banana / Flux / GPT Image tarzı. (free tier varsa)
- Stability AI — **Implemented**: Stable Image Core/Ultra ile boudoir/editorial kalite (free credits).
- Runware — **Re-enabled + implemented**: SDXL/Flux tabanlı düşük maliyetli adult mood üretim (free tier).
- Cloudflare Workers AI — **Implemented**: Edge, hızlı, free allocation.
- ComfyUI Local — **Implemented + en iyi full**: Kullanıcı kendi lokal workflow/modelini bağlarsa **free ve tamamen serbest**. NSFW checkpoint (Pony, Flux uncensored) ile FULL explicit sex/porno görsel+video+sohbet mümkün. **En güçlü ve önerilen (REST güçlü, esnek)**.
- Fooocus Local — **Implemented + çok iyi**: Lokal SDXL tabanlı hızlı adult mood/fashion/editorial. Basit API, kolay kurulum. **Çok iyi (kolay)**.
- Perchance Experimental — **Implemented ama önerilmez**: Sadece kullanıcının kendi stabil proxy endpoint'i varsa (kırılgan, unofficial).

**Local vs Shared karşılaştırması (user feedback):**
| Provider | API Gücü | Free? | Serbestlik | Kolaylık | Not |
|----------|----------|-------|------------|----------|-----|
| ComfyUI (Local) | Çok güçlü REST | Evet (kullanıcı) | Tamamen serbest (full sex/porno fictional) | Orta | **En iyi** |
| Fooocus (Local) | Basit API (fork'larda) | Evet | Tamamen serbest | Kolay | **Çok iyi** |
| Perchance + unofficial | Var ama kırılgan | Evet | Var | Kolay | Önerilmez |

Diğer online permissive servisler (real kişi hariç sex/porno görsel/video üretebilen zero/low-cost) eklenebilir (mümkün olanlar araştırılıp listeye).

## Adult Video

- Pollinations LTX-2
  - Free/ucuz text-to-video ana varsayilan.
  - Adult mood, romantic/sensual, boudoir-style video promptlari icin.

- HuggingFace LTX-Video
  - HF_TOKEN ile free-tier video fallback.

- ComfyUI Local Video
  - Kullanici lokal video workflow kurarsa free video.

- Wavespeed
  - Wan / Seedance Lite / Kling free-trial veya key tabanli video.

- Fal.ai / Replicate
  - Seedance 2.0 ve baska queue tabanli video modelleri.

- Vidu
  - Uygun maliyetli 540p/720p video.

- Gemini Veo
  - Premium video; billing/key gerektirir.

## Adult Mode Rules

- Chat tarafinda daha cesur, after-dark, roleplay, dominant/suggestive ton desteklenir.
- Image/video tarafinda adult mood, boudoir, lingerie, sensual editorial, romantic intimacy desteklenir.
- Reşit olmayan, riza disi/zorlama, ifsa/deepfake, gizli cekim, cinsel siddet her zaman bloklanir.
- Explicit pornografik sahne, genital odakli ciplaklik veya cinsel eylem gorseli/video uretimi desteklenmez.
