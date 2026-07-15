# Froxy AI - Railway Kurulum Adimlari

Bu proje Hostinger shared hosting uzerinde tam backend calistiramaz.
Chat, gorsel, auth ve model katalog icin Node.js backend ayri bir hostta calismalidir.

## 1) GitHub'a yukle

Bu klasoru GitHub'a yukle:

`C:\Users\habil\.gemini\antigravity\scratch\ApiMarket`

GitHub'da yeni repo olustur:

- Repo adi: `froxyai`
- Public veya Private fark etmez

## 2) Railway'de yeni proje ac

- Railway > `New Project`
- `Deploy from GitHub Repo`
- Az once yukledigin `froxyai` reposunu sec

Bu projede `railway.json` oldugu icin Railway otomatik olarak:

- build alir
- `node server.js` ile baslatir

## 3) Railway Environment Variables ekle

Railway projesinde:

- `Variables`
- `New Variable`

Asagidaki degerleri `.env.keys` dosyasindan tek tek ekle.

Kaynak dosya:

`C:\Users\habil\.gemini\antigravity\scratch\ApiMarket\.env.keys`

Eklenmesi gereken temel alanlar:

- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_USERNAME`
- `GROQ_API_KEY`
- `OPENROUTER_API_KEY`
- `GOOGLE_API_KEY`
- `GEMINI_API_KEYS`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `AIMLAPI_KEY`
- `CEREBRAS_API_KEY`
- `SAMBANOVA_API_KEY`
- `NVIDIA_API_KEY`
- `HF_TOKEN`
- `OPENAI_TTS_KEY`

Ek olarak bu sabitleri de ekle:

- `NODE_ENV=production`
- `PORT=3000`

## 4) Deploy URL'ini al

Railway deploy bitince sana bir URL verir.

Ornek:

- `https://froxyai-production.up.railway.app`

Bu URL'i kaydet.

## 5) Hostinger DNS'te subdomain ac

Hostinger > Domainler > `froxyai.com` > DNS Zone

Yeni kayit:

- Type: `CNAME`
- Name: `api`
- Target: Railway'in verdigi domain

Sonuc:

- `api.froxyai.com`

## 6) Frontend'i backend'e bagla

Sonraki adimda frontend icindeki `/api/...` isteklerini:

- `https://api.froxyai.com/api/...`

seklinde sabitleyecegiz.

Bu degisikligi ben kodda yapacagim.

## 7) Son test

Asagidaki sayfalar acilmali:

- `https://api.froxyai.com/api/health`
- `https://api.froxyai.com/api/model-catalog`

Sonra ana site:

- `https://froxyai.com`

uzerinden chat ve gorsel test edilir.

## Not

Hostinger shared hosting tarafinda backend calismadigi icin:

- `froxyai.com/api/...`

calismasi beklenmez.

Bu proje icin dogru mimari:

- `froxyai.com` = frontend
- `api.froxyai.com` = backend
