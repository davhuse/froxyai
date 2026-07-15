# Claude CLI Tasarım Denemesi Notları

Claude CLI için çalışan komut:

```powershell
$OutputEncoding = [System.Text.UTF8Encoding]::new()
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()
Get-Content -Raw -Encoding UTF8 -LiteralPath 'C:\Users\habil\.gemini\antigravity\scratch\ApiMarket\claude-hero-short-prompt.txt' | claude -p --tools="" --permission-mode dontAsk --input-format text --output-format text
```

Neden önce takıldı:

- PowerShell `< file.txt` redirection desteklemiyor.
- `claude` tek başına interactive moda giriyor, uzun promptta sessiz bekliyor.
- `--tools ""` yanlış quote edilirse Claude argümanları bozuyor.
- Doğru kullanım `--tools=""`.

Claude'un önerdiği en iyi yön:

- Hero için `Neural Orb + Komuta Merkezi` hibriti.
- Canvas particle sistemi, CSS neural orb, floating model kartları, mouse parallax, counter animation.
- Maskot tek başına premium hissi azaltabilir, dashboard tek başına sıradan kalabilir.

Risk:

- Claude cevap içinde `tool_call`, `Write`, `Bash` gibi bloklar üretti ama bunlar gerçek dosya yazmadı.
- Kod doğrudan entegre edilmeden önce Türkçe karakter, gerçek model sayısı, CTA linkleri, performans ve mobil taşma kontrol edilmeli.
