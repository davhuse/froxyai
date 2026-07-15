# Froxy AI — tıklanabilir arayüz prototipi

Bu klasör, mevcut uygulamaya veya API anahtarlarına dokunmadan çalışan bağımsız bir **Froxy AI** sohbet deneyimi prototipidir. Arayüz, ChatGPT/Gemini sınıfındaki ürünlerin yaygın etkileşim kalıplarını kullanır; marka, içerik, düzen ve kod sıfırdan Froxy için yazılmıştır.

## Açma

`index.html` dosyasını doğrudan tarayıcıda açabilirsiniz. Yerel bir sunucu ile açmak isterseniz proje kökünden:

```powershell
npx vite --host 127.0.0.1 --port 4178 --root prototypes/froxy-ai
```

Ardından `http://127.0.0.1:4178` adresine gidin.

## Sayfa haritası

| Sayfa | Dosya | İçerik |
| --- | --- | --- |
| Çalışma alanı | `index.html` | Sohbet, Keşfet, Dosyalar, Görsel Stüdyo, Prompt Kütüphanesi ve Projeler |
| Açılış sayfası | `landing.html` | Ürün hikâyesi, özellikler, model kartları, fiyatlandırma ve SSS |
| Giriş / kayıt | `auth.html` | Giriş-kayıt geçişi, şifre görünürlüğü ve prototip yönlendirmesi |
| Admin | `admin.html` | Genel bakış, Kullanıcılar, Modeller, Krediler ve Sistem Sağlığı sekmeleri |

Tüm sayfalar birbirine bağlıdır ve görsel/demo etkileşimlerini tarayıcıda çalıştırır. Kimlik doğrulama, ödeme, model API'leri ve dosya işleme gerçek servisler yerine güvenli örnek akışlarla temsil edilir.

## Prototipte çalışanlar

- Mobil drawer'lı sohbet geçmişi ve yeni çalışma akışı
- Froxy Core / Swift / Vision model seçimi
- Keşfet ve Dosyalar görünümleri
- Görsel Stüdyo, Prompt Kütüphanesi ve Projeler görünümleri
- Öneri kartının prompt alanını doldurması
- Dosya ekleme çipleri
- `Ctrl/Cmd + Enter` ile demo mesaj gönderme
- Düşünme animasyonu, bağlama duyarlı demo yanıtı, kopyala / yeniden üret / beğeni etkileşimleri
- Açılış sayfasında fiyat aralığı değişimi ve SSS
- Admin'de kullanıcı filtreleme, model/entegrasyon anahtarları ve kredi aksiyonları

Bu sürüm gerçek bir LLM'e istek atmaz; tüm yanıtlar arayüz denemesi için tarayıcıda üretilen güvenli örnek içeriktir.

## Araştırılan temel şablon kaynakları

| Kaynak | Ne için uygun? | Lisans / not |
| --- | --- | --- |
| [Vercel Chatbot](https://github.com/vercel/chatbot) | Üretim seviyesinde Next.js sohbet ürünü; çoklu model, geçmiş, dosya ve kimlik doğrulama yapısı | Apache-2.0; gerçek model ve altyapı maliyetleri ayrıca oluşur. |
| [assistant-ui](https://www.assistant-ui.com/docs/cli) | React/Next.js üzerinde hızla özgün AI arayüzü kurmak | MIT; `npx assistant-ui@latest create` ile başlangıç kurulabilir. |
| [LibreChat](https://github.com/danny-avila/LibreChat) | Çok sağlayıcılı, ajan/MCP'li ileri ürün | MIT; küçük prototip için ağır, büyümek isteyen ürün için güçlü. |
| [Hugging Face Chat UI](https://github.com/huggingface/chat-ui) | Modern açık kaynak sohbet deneyimi ve görsel referans | Apache-2.0; SvelteKit tabanlı. |
| [NextChat](https://github.com/ChatGPTNextWeb/NextChat) | Hafif PWA/çoklu platform başlangıcı | MIT; hızlı demo için uygun. |

Froxy'nin gerçek uygulama sürümü için önerilen yol: Vercel Chatbot'un ürün mimarisi ile assistant-ui'nin özelleştirilebilir bileşen yaklaşımını birleştirmek; sonrasında model katmanını seçilen sağlayıcıya bağlamaktır.
