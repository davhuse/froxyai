# Provider Roadmap

Bu not, mevcut yedekten sonra siteye eklenmesi veya tamamlanması planlanan saglayicilari toplar.

## Chat

- Pollinations chat: free chat, spicy/after-dark roleplay presetleri.
- OpenRouter: free modeller ve Venice/Dolphin gibi adult-roleplay uyumlu modeller.
- Groq: hizli fallback ve free kalite modelleri.
- Chutes AI: gunluk free quota ile Llama, DeepSeek, Qwen modelleri.
- CometAPI: multi-model fallback.
- Jan Local: kullanicinin lokal OpenAI-compatible chat sunucusu.
- Local OpenAI-Compatible: LM Studio, Ollama bridge veya benzeri lokal endpointler.

## Image

- Pollinations Image: free Flux tabanli uretim ve fallback.
- ImageGPT: free gorsel hatti varsa ucuz varsayilan.
- OpenAI Image: GPT Image hatti.
- Gemini / Imagen: Imagen 4, Imagen 4 Fast, Ultra ve Gemini image modelleri.
- Together AI: Flux, Qwen Image, Gemini image modelleri.
- Cloudflare Workers AI: SDXL/Flux tabanli edge gorsel uretim.
- Runware: Flux/SDXL free-tier veya dusuk maliyetli uretim.
- Stability AI: Stable Image Core/Ultra.
- AIML API: Nano Banana, Flux, GPT Image tarzi unified image modelleri.
- ComfyUI Local: kullanici lokal workflow ile free uretim.
- Fooocus Local: kullanici lokal Fooocus API ile free uretim.
- Perchance Experimental: kullanicinin kendi proxy endpointi varsa deneysel baglanti.

## Video

- Pollinations LTX-2: free/ucuz text-to-video ana varsayilan.
- Pollinations Auto Video: LTX-2 alias/fallback.
- HuggingFace LTX-Video: HF_TOKEN ile free-tier denemesi.
- ComfyUI Local Video: lokal workflow ile free video.
- Wavespeed: Wan, Seedance Lite, Kling free-trial/key tabanli video.
- Fal.ai / Replicate: Seedance 2.0 ve diger queue tabanli video modelleri.
- Vidu: Q3 Turbo 540p/720p uygun maliyetli video.
- Gemini Veo: Veo 2, Veo 3, Veo 3.1 Fast/Preview.

## Search / Tools

- Tavily: web research ve prompt zenginlestirme.
- Brave Search: dusuk maliyetli arama fallback.
- DuckDuckGo fallback: keysiz temel arama.

## Safety Position

- Adult chat: yetişkin, rızalı, suggestive roleplay tonu desteklenir (shared); local'larda bayağı cinsellik + graphic (sadece illegal bloklar).
- Image/video: adult mood, boudoir, lingerie, sensual/editorial, romantic intimacy desteklenir (shared). Local Comfy/Fooocus ile FULL fictional explicit sex/porno (gerçek kişi hariç).
- Shared'larda explicit pornografik sahne, genital odaklı çıplaklık, cinsel eylem görsel/video üretimi desteklenmez (blok + policy).
- Her zaman reşit olmayan, rıza dışı/zorlama, ifşa/deepfake, gizli çekim ve cinsel şiddet bloklanır (local dahil).
- Bkz: docs/adult-provider-roadmap.md (Comfy en iyi full için, vs).

Local vs Shared: ComfyUI (en iyi, full serbest), Fooocus (kolay, iyi), Perchance (kırılgan, önerilmez). Shared'lar (Pollinations, Together, Stability...) roadmap suggestive scope.
