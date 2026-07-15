# Modal + Cloudflare Image Setup

## Modal GPU image endpoint

1. Set the Modal token locally. Do not commit it.

```powershell
modal token set --token-id YOUR_TOKEN_ID --token-secret YOUR_TOKEN_SECRET
```

2. Deploy the Froxy Modal image endpoint.

```powershell
modal deploy scripts/modal_image_app.py
```

3. Copy the deployed `generate` URL into `.env.keys`.

```env
MODAL_IMAGE_ENDPOINT=https://YOUR-WORKSPACE--froxy-modal-image-generate.modal.run
```

Optional endpoint auth:

```env
MODAL_IMAGE_AUTH_TOKEN=choose-a-long-random-secret
```

When `MODAL_IMAGE_ENDPOINT` is present, `/gorsel` shows `Modal GPU SDXL - Ready` as `modal-sdxl`.

## Cloudflare Workers AI token

Cloudflare does not run ComfyUI. It runs Cloudflare-hosted Workers AI models.

Create an API token in Cloudflare Dashboard:

- Account scope: the account that owns Workers AI
- Permissions: Workers AI read/run access for the account

Then add:

```env
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token
```

Verify:

```powershell
curl.exe -H "Authorization: Bearer $env:CLOUDFLARE_API_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/verify
```

Cloudflare image models appear only when the app can verify the token.

## Local GPU providers

These providers run on your own GPU and appear in `/gorsel` only when their health check passes.

### A1111 Stable Diffusion WebUI

Start WebUI with API enabled:

```powershell
webui-user.bat --api --listen
```

Default Froxy endpoint:

```env
A1111_API_URL=http://127.0.0.1:7860
```

### Forge

Start Forge with API enabled. If you run it on a different port, set:

```env
FORGE_API_URL=http://127.0.0.1:7861
```

If Forge uses `7860`, set `FORGE_API_URL=http://127.0.0.1:7860`.

### SwarmUI

Froxy checks:

```env
SWARMUI_API_URL=http://127.0.0.1:7801
```

SwarmUI support is experimental because API payloads can differ by build.
