(function () {
  'use strict';

  const STORAGE_KEY = 'ap_lang';
  const LEGACY_KEY = 'ap_translate_lang';
  const BASE_TITLE = document.title;
  const originalText = new WeakMap();
  const originalAttrs = new WeakMap();

  const TR_EN = new Map(Object.entries({
    'Özellikler': 'Features',
    'Modeller': 'Models',
    'Demo': 'Demo',
    'Fiyatlandırma': 'Pricing',
    'Güven': 'Trust',
    'Giriş Yap': 'Sign In',
    'Çıkış': 'Sign Out',
    'Kayıt Ol': 'Sign Up',
    'Panele Git': 'Open Dashboard',
    'Sohbete Geç': 'Open Chat',
    '100 Krediyle Dene': 'Try with 100 Credits',
    'Ücretsiz Başla': 'Start Free',
    'Ücretsiz Dene': 'Try Free',
    'İş Paketini Ücretsiz Dene': 'Try the Content Pack Free',
    'Örnek Akışı Aç': 'Open Sample Flow',
    'Görsel Üretmeyi Dene': 'Try Image Generation',
    'Yeni Kullanıcı Avantajı': 'New Member Benefit',
    'Yeni üyelere özel:': 'New members only:',
    'kodu ile %20 indirim!': 'get 20% off with code!',
    '1.100+ gelişmiş AI modeli tek platformda': '1,100+ advanced AI models on one platform',
    '100 kredi ile ücretsiz deneyin': 'try free with 100 credits',
    'KOBİ, ajans ve içerik üreticileri için': 'For SMBs, agencies and content creators',
    '5 dakikada': 'In 5 minutes',
    'iş içerik paketi üret.': 'create a complete content pack.',
    '100 ücretsiz başlangıç kredisi': '100 free starter credits',
    'Kart bilgisi gerekmez': 'No card required',
    'KVKK uyumlu': 'Privacy compliant',
    'AI Sohbet': 'AI Chat',
    '1.100+ Gelişmiş Model': '1,100+ Advanced Models',
    'Görsel Galeri': 'Image Gallery',
    'Ultra HD Görseller': 'Ultra HD Images',
    'Kod Editörü': 'Code Editor',
    'Hatasız Kod Üretimi': 'Reliable Code Generation',
    'Sohbet': 'Chat',
    'Görsel Üretim': 'Image Generation',
    'AI Ajanlar': 'AI Agents',
    'Dosya Analizi': 'File Analysis',
    'Web Arama': 'Web Search',
    'Araçlar': 'Tools',
    'Destek': 'Support',
    'Çalışma Alanı': 'Workspace',
    'Başlangıç Kredisi': 'Starter Credits',
    'Hazır': 'Ready',
    'Gönder': 'Send',
    'Yeni Sohbet': 'New Chat',
    'Sohbet Geçmişi': 'Chat History',
    'Geçmiş': 'History',
    'Ayarlar': 'Settings',
    'Genel Bakış': 'Overview',
    'Kontrol Paneli': 'Dashboard',
    'Panel': 'Dashboard',
    'Galeri': 'Gallery',
    'Analitik': 'Analytics',
    'Rozetler': 'Badges',
    'API Anahtarları': 'API Keys',
    'Mağaza': 'Store',
    'Promptlar': 'Prompts',
    'Bilgi Bankası': 'Knowledge Base',
    'Bildirimler': 'Notifications',
    'Hesap': 'Account',
    'Görünüm': 'Appearance',
    'Tema': 'Theme',
    'Dil': 'Language',
    'Dil seçimi': 'Language',
    'Türkçe': 'Turkish',
    'İngilizce': 'English',
    'Kaydet': 'Save',
    'İptal': 'Cancel',
    'Kapat': 'Close',
    'Temizle': 'Clear',
    'Ara': 'Search',
    'Tümü': 'All',
    'Popüler': 'Popular',
    'Yeni': 'New',
    'Ücretsiz': 'Free',
    'Kredi': 'Credits',
    'Kullanım': 'Usage',
    'Model Seçin': 'Choose a Model',
    'AI Model Komuta Paneli': 'AI Model Command Center',
    'Model sıralama': 'Model sorting',
    'Aramayı temizle': 'Clear search',
    'Model seçiciyi kapat': 'Close model picker',
    'Yasal': 'Legal',
    'Gizlilik Politikası': 'Privacy Policy',
    'Kullanım Koşulları': 'Terms of Use',
    'Hakkımızda': 'About',
    'İletişim': 'Contact',
    'Sık Sorulan Sorular': 'Frequently Asked Questions',
    'Şimdi Başla': 'Get Started',
    'Daha Fazla': 'Learn More',
    'Kopyala': 'Copy',
    'İndir': 'Download',
    'Paylaş': 'Share',
    'Yeniden Dene': 'Try Again',
    'Yükleniyor...': 'Loading...',
    'Sonuçlar': 'Results',
    'Aktif': 'Active',
    'Pasif': 'Inactive',
    'Bağlı': 'Connected',
    'Bağlantıyı Kes': 'Disconnect',
    'Devam Et': 'Continue',
    'Geri': 'Back',
    'Sonraki': 'Next',
    'Onayla': 'Confirm',
    'Ana içeriğe atla': 'Skip to main content',
    'ÇALIŞMA ALANI': 'WORKSPACE',
    'Görsel AI': 'Image AI',
    'Görsel üretildi · 1024 × 1024': 'Image generated · 1024 × 1024',
    'ücretsiz dene': 'try for free',
    '5 dakikada iş içerik paketi': 'Complete content pack in 5 minutes',
    'Sohbet + görsel prompt': 'Chat + image prompts',
    'Hazır AI araçlar': 'Ready-to-use AI tools',
    'Kredi bazlı kullanım': 'Credit-based usage',
    'Güvenli ödeme': 'Secure payment',
    'Destek sistemi': 'Support system',
    'Günlük AI işlerini tek panelden yönetin.': 'Manage daily AI work from one dashboard.',
    'Sohbet, görsel üretim, ajanlar ve hazır iş akışları aynı hesapta, aynı kredi sistemiyle çalışır.': 'Chat, image generation, agents and ready-made workflows run under one account and one credit system.',
    'Metin, kod, dosya ve web destekli ana çalışma alanı.': 'Your main workspace for text, code, files and web tasks.',
    'Prompt yaz, stil ve boyut seç, galeriye kaydet.': 'Write a prompt, choose a style and size, then save it to your gallery.',
    'SEO, hukuk, kod ve satış uzmanlarını başlat.': 'Launch specialists for SEO, legal, coding and sales tasks.',
    'AI Araçları': 'AI Tools',
    'Hazır iş akışlarını sohbete aktar.': 'Send ready-made workflows to chat.',
    'tek seçicide.': 'in one picker.',
    'Popüler sağlayıcılar tek seçicide.': 'Popular providers in one picker.',
    'GPT, Claude, Gemini, DeepSeek, Llama ve OpenRouter. Yüzlerce modele tek panelden erişin.': 'GPT, Claude, Gemini, DeepSeek, Llama and OpenRouter. Access hundreds of models from one dashboard.',
    'Kodlama ve analiz': 'Coding and analysis',
    'Uzun metin kalitesi': 'Long-form quality',
    'Hızlı ve çok modlu': 'Fast and multimodal',
    'Kod ve mantık': 'Code and reasoning',
    'Açık modeller': 'Open models',
    'Alternatif erişim': 'Alternative access',
    'Model maliyeti, sağlayıcı ve yetenekler tek ekranda.': 'Compare model cost, provider and capabilities in one place.',
    'Görsel okur': 'Vision capable',
    'Kod yazar': 'Writes code',
    'Hızlı yanıt': 'Fast response',
    'Paneli Aç': 'Open Dashboard',
    'nasıl çalışır?': 'how does it work?',
    'Froxy AI nasıl çalışır?': 'How does Froxy AI work?',
    'Model seç, mesajını yaz, görsel üret veya hazır araçları çalıştır.': 'Choose a model, write your message, generate an image or run a ready-made tool.',
    'Videoyu Oynat': 'Play Video',
    'Froxy AI Panelini İzle': 'Watch the Froxy AI Dashboard',
    '2 Dakikalık Demo': '2-Minute Demo',
    'Modeli seç': 'Choose a model',
    'GPT, Claude, Gemini veya uygun maliyetli açık modeller arasından seçim yap.': 'Choose from GPT, Claude, Gemini or cost-effective open models.',
    'Briefi yaz': 'Write your brief',
    'Sohbet, dosya, görsel ve hazır araç akışlarını aynı panelde başlat.': 'Start chat, file, image and ready-made tool workflows from the same dashboard.',
    'Çıktıyı kullan': 'Use the output',
    'Kredi maliyetini gör, galeriye kaydet veya aynı briefi farklı modelle dene.': 'See the credit cost, save it to your gallery or try the same brief with another model.',
    'Yeni üye teklifi': 'New member offer',
    'Yeni üyeler 100 ücretsiz krediyle başlar.': 'New members start with 100 free credits.',
    'Kayıt ol, kart bilgisi girmeden Froxy AI panelini dene. Sohbet, görsel üretim ve hazır AI araçlarını tek panelden test et.': 'Sign up and try Froxy AI without entering card details. Test chat, image generation and ready-made AI tools in one dashboard.',
    'Ücretsiz Kayıt Ol': 'Sign Up Free',
    'Shopier paketleriyle aynı net kredi sistemi.': 'One clear credit system across Shopier packages.',
    'Kartla güvenli öde, kredin hesabına tanımlansın. Paketler tek panelde sohbet, görsel üretim ve AI araçları için kullanılır.': 'Pay securely by card and receive credits in your account. Use them for chat, image generation and AI tools.',
    'Başlangıç': 'Starter',
    '5.000 krediyle temel kullanım ve hızlı deneme.': '5,000 credits for essential use and quick testing.',
    'Tüm modellere erişim': 'Access to all models',
    '200 istek/gün limiti': '200 requests/day',
    'Topluluk desteği': 'Community support',
    "Shopier'de Satın Al": 'Buy on Shopier',
    'En popüler': 'Most popular',
    'En dengeli': 'Best value',
    '15.000 kredi, görsel üretim ve daha geniş günlük limit.': '15,000 credits, image generation and a higher daily limit.',
    '500 istek/gün limiti': '500 requests/day',
    'Görsel üretim dahil': 'Image generation included',
    'Profesyonel': 'Professional',
    'Yoğun kullanım': 'Heavy usage',
    '50.000 kredi, profesyonel iş akışları ve öncelikli destek.': '50,000 credits, professional workflows and priority support.',
    '1.500 istek/gün limiti': '1,500 requests/day',
    'Öncelikli destek': 'Priority support',
    'Güvenli ödeme, açık kullanım şartları ve destek sistemi.': 'Secure payments, clear terms and reliable support.',
    'Kredi kullanımı, ödeme adımları, gizlilik metinleri ve destek kanalları kullanıcı için net tutulur.': 'Credit usage, payment steps, privacy terms and support channels are clearly presented.',
    'Froxy güven katmanı': 'Froxy trust layer',
    'Kullanıcı ne harcadığını, nereden destek alacağını ve hangi metinleri kabul ettiğini net görür.': 'Users can clearly see their spending, support options and accepted terms.',
    'Kart bilgisi gerektirmeyen deneme, açık kredi sistemi ve destek akışı tek hesapta tutulur.': 'A card-free trial, transparent credits and support are managed under one account.',
    'Kredi sistemi açık': 'Transparent credit system',
    'Model ve araç kullanımı kredi bazlı takip edilir.': 'Model and tool usage is tracked by credits.',
    'Güvenli ödeme altyapısı': 'Secure payment infrastructure',
    'Ödeme, paket ve iade bilgileri ayrı metinlerde sunulur.': 'Payment, package and refund details are presented separately.',
    'KVKK ve gizlilik metinleri hazır': 'Privacy terms are available',
    'Veri işleme ve saklama bilgileri görünür durumdadır.': 'Data processing and retention details are visible.',
    'Destek talepleri panelden veya e-posta ile iletilebilir.': 'Support requests can be submitted from the dashboard or by email.',
    'Sık sorulan sorular.': 'Frequently asked questions.',
    '100 ücretsiz kredi nasıl kullanılır': 'How do I use the 100 free credits?',
    'Kayıt olan yeni üyelerin hesabına başlangıç kredisi tanımlanır. Bu krediyle sohbet, görsel üretim ve hazır araçları deneyebilirler.': 'Starter credits are added to every new account. Use them for chat, image generation and ready-made tools.',
    'Kart bilgisi gerekiyor mu': 'Is card information required?',
    'Hayır. Ücretsiz deneme için kart bilgisi gerekmez.': 'No. Card information is not required for the free trial.',
    'Froxy AI neden ayrı ayrı AI aboneliklerinden farklı': 'How is Froxy AI different from separate AI subscriptions?',
    'Froxy AI, farklı modelleri ve araçları tek panelde kredi sistemiyle kullanmanı sağlar. Böylece farklı platformlar arasında geçiş yapmak zorunda kalmazsın.': 'Froxy AI lets you use different models and tools through one credit system, without switching between platforms.',
    'Froxy AI nedir': 'What is Froxy AI?',
    'Sohbet modelleri, görsel üretim, AI ajanlar, dosya analizi ve web aramayı tek panelde birleştiren premium AI çalışma alanıdır.': 'A premium AI workspace combining chat models, image generation, AI agents, file analysis and web search.',
    'Kredi sistemi nasıl çalışır': 'How does the credit system work?',
    'Her modelin maliyeti farklıdır. Başarılı çıktı alındığında seçilen model maliyeti kadar kredi düşer.': 'Each model has a different cost. Credits are charged only when a successful result is produced.',
    'Ödeme sonrası destek alabilir miyim': 'Can I get support after payment?',
    'Evet. Panelde destek bileti açabilir, yanıtları aynı ekrandan takip edebilirsiniz.': 'Yes. Open a support ticket and track replies from the dashboard.',
    'AI modellerini, görsel üretimi ve destek akışını tek panelde birleştiren premium çalışma alanı.': 'A premium workspace combining AI models, image generation and support in one dashboard.',
    'Gizlilik': 'Privacy',
    'Kullanım Şartları': 'Terms of Use',
    'Kullanım artları': 'Terms of Use',
    'İade ve İptal': 'Refunds and Cancellation',
    '© 2026 Froxy AI. Tüm hakları saklıdır.': '© 2026 Froxy AI. All rights reserved.'
    ,'Görsel Üret': 'Generate Image'
    ,'AI ajanlar': 'AI agents'
    ,'Sohbet geçmişi': 'Chat history'
    ,'Froxy AI çalışma alanı': 'Froxy AI workspace'
    ,'Bugün ne Üretelim?': 'What shall we create today?'
    ,'1.100+ güncel model, görsel araçları, web arama, dosya analizi ve ajanlar tek profesyonel sohbet alanında.': '1,100+ current models, image tools, web search, file analysis and agents in one professional chat workspace.'
    ,'Kendini tanıt': 'Introduce yourself'
    ,'Plan çıkar': 'Create a plan'
    ,'İnternetten ara': 'Search the web'
    ,'Türkçe düzelt': 'Improve Turkish'
    ,'Görsel': 'Images'
    ,'Menü': 'Menu'
    ,'Ana sayfa': 'Home'
    ,'Dosya yükle': 'Upload file'
    ,'Sesli yazdır': 'Voice input'
    ,'Hızlı geçiş': 'Quick navigation'
    ,"Froxy AI'a mesaj yaz...": 'Message Froxy AI...'
    ,'Yeni sohbet': 'New chat'
    ,'Sohbeti sil': 'Delete chat'
    ,'Dışa aktar': 'Export'
    ,'Sohbeti dışa aktar (Markdown)': 'Export chat (Markdown)'
    ,'Sohbeti disa aktar (Markdown)': 'Export chat (Markdown)'
    ,'Kısa cevap': 'Short answer'
    ,'Kod açıkla': 'Explain code'
    ,'Modellerle karşılaştır': 'Compare models'
    ,'Tamam': 'Got it'
    ,'Görsel Üretici': 'Image Generator'
    ,'AI ile profesyonel görseller oluşturun': 'Create professional images with AI'
    ,'Yeni Üret': 'New Generation'
    ,'Fotoğrafı düzenle': 'Edit Photo'
    ,'Yetişkin mod': 'Adult mode'
    ,'Rızalı yetişkin romantik/ateşli içerik': 'Consensual adult romantic content'
    ,'Boudoir Görsel': 'Boudoir Image'
    ,'Sinematik Yakınlık': 'Cinematic Intimacy'
    ,'Prompt stüdyosu': 'Prompt Studio'
    ,'Stil ekle, promptu güçlendir veya hızlı fikir al.': 'Add a style, improve your prompt or get a quick idea.'
    ,'Foto gerçekçi': 'Photorealistic'
    ,'Ürün çekimi': 'Product Photography'
    ,'18+ / Yetişkin Presetler': '18+ / Adult Presets'
    ,'Modelleri Karşılaştır': 'Compare Models'
    ,'Aynı prompt, 2 farklı AI modeli': 'One prompt, two different AI models'
    ,'Toplu Üretim': 'Batch Generation'
    ,"5'e kadar prompt aynı anda": 'Generate up to five prompts at once'
    ,'Seçili model': 'Selected model'
    ,'Üretim sonrası': 'After generation'
    ,'Son görseller ve yeniden üretim': 'Recent images and regeneration'
    ,'Beğendiğin çıktıyı aç, promptu tekrar yükle veya aynı stille yeni varyasyon üret.': 'Open a result, reload its prompt or create a new variation in the same style.'
    ,'Galeri hazır': 'Gallery ready'
    ,'İlk sağlam görsel üretiminden sonra son çıktılar burada görünecek.': 'Your latest results will appear here after the first successful generation.'
    ,'Görsel Üretmeye başla': 'Start Generating Images'
    ,'Son Üretilen görseller burada tutulur': 'Recently generated images are stored here'
    ,'Henüz görsel yok. Ürettiğin görseller burada saklanacak.': 'No images yet. Your generated images will be saved here.'
    ,'İşte hesabının güncel durumu': 'Here is your current account status'
    ,'Kalan Kredi': 'Remaining Credits'
    ,'Kullanılan Kredi': 'Credits Used'
    ,'API İsteği': 'API Requests'
    ,'Model kullanımı, kredi akışı, hızlı araçlar ve aktif servislerin tek ekranda toplandığı profesyonel panel.': 'A professional dashboard for model usage, credits, quick tools and active services.'
    ,'Görsel varyasyon oluştur': 'Create an image variation'
    ,'Model kalite puanı': 'Model quality score'
    ,'Hız, ucuzluk, kod, yaratıcılık ve Türkçe başarısı birlikte skorlanır.': 'Speed, cost, coding, creativity and Turkish quality are scored together.'
    ,'Fallback geçmişi': 'Fallback history'
    ,'Henüz fallback yok': 'No fallback yet'
    ,'Kullanıcı limit koruması': 'User rate-limit protection'
    ,'Kredi & Paketler': 'Credits & Packages'
    ,'Bilet aç / Yardım': 'Open Ticket / Help'
    ,'Bonus kredi': 'Bonus credits'
    ,'Sağlayıcı Sağlık Kontrolü': 'Provider Health Check'
    ,'Sohbet / Dil Modelleri': 'Chat / Language Models'
    ,'Satış, reklam ve içerik işlerini tek panelde hızlandır.': 'Speed up sales, advertising and content work from one dashboard.'
    ,'Brief yaz, aracı seç, Froxy promptu hazırlar ve işi sohbete taşır. Bu bölüm hızlı gelir akışları, destek, SEO, marka ve görsel üretim için sadeleştirildi.': 'Write a brief and choose a tool; Froxy prepares the prompt and sends it to chat. Built for sales, support, SEO, branding and image workflows.'
    ,'Konu alındı': 'Topic received'
    ,'Uygun akış': 'Recommended flow'
    ,'Çıktı': 'Output'
    ,'Sohbete hazır': 'Ready for chat'
    ,'çalıştırılabilir araç': 'ready-to-run tools'
    ,'sağlayıcı': 'providers'
    ,'Para kazandıracak iş akışları': 'Revenue-focused workflows'
    ,'Satış': 'Sales'
    ,'Tasarım': 'Design'
    ,'İçerik': 'Content'
    ,'Çalıştır': 'Run'
    ,'AI Landing Page Üretici': 'AI Landing Page Generator'
    ,'Instagram Mini Site Üretici': 'Instagram Mini-Site Generator'
    ,'UI Section Prompt Üretici': 'UI Section Prompt Generator'
    ,'AI Sunum Oluşturucu': 'AI Presentation Creator'
    ,'Ürün Fotoğraf Stüdyosu': 'Product Photo Studio'
    ,'Prompt İyileştirici': 'Prompt Improver'
    ,'SEO İçerik Merkezi': 'SEO Content Hub'
    ,'PDF / Dosya ile Sohbet': 'Chat with PDF / Files'
    ,'Destek Botu Widget': 'Support Bot Widget'
    ,'yardımcı olabiliriz': 'we can help'
    ,'Sorunlarınızı anında çözüme yaklaştırın. API, fatura, görsel üretim ve model akışları için destek taleplerinizi tek merkezden yönetin.': 'Resolve issues faster. Manage support requests for APIs, billing, image generation and model workflows in one place.'
    ,'İlk yanıt': 'First response'
    ,'İzleme': 'Tracking'
    ,'Çözüm oranı': 'Resolution rate'
    ,'Doğrudan destek': 'Direct support'
    ,'Ticket dışında e-posta ile de ulaşabilirsin.': 'You can also contact us by email.'
    ,'Başlık': 'Subject'
    ,'Açıklama Detayı': 'Description'
    ,'Öncelik Seviyesi': 'Priority'
    ,'Henüz bilet yok': 'No tickets yet'
    ,'Model neden değişiyor': 'Why does the model change?'
    ,'Görsel neden bekliyor': 'Why is image generation waiting?'
    ,'API hatasında ne yazmalıyım': 'What should I include in an API error report?'
    ,'Cevaplar nerede kalır': 'Where are replies stored?'
    ,'Kredi, model ve ajans paketleri tek ekranda': 'Credits, model and agency packages in one place'
    ,'Paketleri gör': 'View Packages'
    ,'Erişim': 'Access'
    ,'Canlı kullanım': 'Live usage'
    ,'Kredi geçmişi': 'Credit history'
    ,'Henüz işlem yok': 'No activity yet'
    ,'İhtiyacına göre seç': 'Choose what fits your needs'
    ,'Üretici': 'Creator'
    ,'Geliştirici': 'Developer'
    ,'İşletme': 'Business'
    ,'Satın Al': 'Buy Now'
    ,'Canlı sıralama': 'Live ranking'
    ,'Top kullanıcılar': 'Top users'
    ,'Hazır profesyonel akışlar': 'Ready-made professional workflows'
    ,'Dönüşüm Odaklı Teklif': 'Conversion-Focused Offer'
    ,'Müşteri Cevabı': 'Customer Reply'
    ,'Hata Ayıklama Planı': 'Debugging Plan'
    ,'Premium Görsel Promptu': 'Premium Image Prompt'
    ,'SERP Uyumlu İçerik': 'SERP-Optimized Content'
    ,'Tıkla, sohbete ekle': 'Click to add to chat'
    ,'UI Bölüm Tasarımı': 'UI Section Design'
    ,'Sunum İskeleti': 'Presentation Outline'
    ,'Fiyat İtirazı Cevabı': 'Price Objection Reply'
    ,'Ürün Fotoğraf Promptu': 'Product Photo Prompt'
    ,'Ürettiğiniz görseller burada': 'Your generated images appear here'
    ,'Henüz görsel yok. İlk üretimden sonra favoriler ve koleksiyonlar burada görünecek.': 'No images yet. Favorites and collections will appear after your first generation.'
  }));

  // Current UI strings are UTF-8. Keep these canonical keys separate from the
  // legacy mojibake map above so dynamically rendered panels translate fully.
  Object.entries({
    'Bugün ne üretelim?':'What shall we create today?',
    'güncel model, görsel araçları, web arama, dosya analizi ve ajanlar tek profesyonel sohbet alanında.':'current models, image tools, web search, file analysis and agents in one professional workspace.',
    'Kalan':'Remaining', 'Sonra':'After', 'Genel':'General', 'Kod':'Code',
    'Araştırma':'Research', 'Hızlı':'Fast', 'Uzun metin':'Long-form',
    'Görsel Üretici':'Image Generator', 'AI ile profesyonel görseller oluşturun':'Create professional images with AI',
    'Model Seçimi':'Model Selection', 'Boyut':'Size', 'Prompt':'Prompt',
    'Yeni üret':'New generation', 'Fotoğrafı düzenle':'Edit photo',
    'Promptu güçlendir':'Improve prompt', 'Rastgele fikir':'Random idea',
    'Görsel Üret':'Generate Image', 'Seçili model':'Selected model',
    'İşlem maliyeti':'Cost per generation', 'Kalan / Sonra':'Remaining / After',
    'Paketleri incele':'View packages', 'Görsel işleri':'Image jobs',
    'Üretim galerisi':'Generation gallery', 'Görsel Geçmişi':'Image history',
    'Henüz üretim işi yok.':'No generation jobs yet.', 'Henüz görsel yok. Ürettiğin görseller burada saklanacak.':'No images yet. Your generated images will be saved here.',
    'Paket kapsamındaki aktif modellere erişim':'Access to active models included in your plan',
    'Yüksek günlük istek limiti':'High daily request limit',
    'Topluluk etkinliği':'Community activity', 'Anonim kullanım özeti':'Anonymous usage summary',
    'Kredi maliyeti işlemden önce görünür':'Credit cost is shown before you start',
    'Günlük sohbet ve temel işler için kredi maliyeti görünür, dengeli bir başlangıç paketi.':'A balanced starter package with visible credit costs for daily work.'
  }).forEach(([tr,en]) => TR_EN.set(tr,en));

  const PHRASES = [
    ['kodu ile %20 indirim!', 'get 20% off with code!'],
    ['1.100+ gelişmiş AI modeli tek platformda', '1,100+ advanced AI models on one platform'],
    ['100 kredi ile ücretsiz deneyin', 'try free with 100 credits'],
    ['Ücretsiz -', 'Free -'],
    [' Kredi ', ' Credits '],
    ['Kredi ', 'Credits '],
    [' kredi', ' credits'],
    ['Seçili model kilitli:', 'Selected model is locked:'],
    ['İşini veya ürününü yaz; Froxy satış metni, Instagram postu, müşteri cevabı, görsel promptu ve reklam hook\'u hazırlasın. Yeni üyeler 100 ücretsiz krediyle başlar, kart bilgisi gerekmez.', 'Describe your business or product; Froxy prepares sales copy, Instagram posts, customer replies, image prompts and ad hooks. New members start with 100 free credits, no card required.'],
    ['100 krediyle ücretsiz dene, iyi sonuç alınca yükselt.', 'Try free with 100 credits, upgrade when you get results.'],
    ['İşini veya ürününü yaz; satış metni, sosyal medya postu, müşteri cevabı ve görsel promptu tek akışta hazırla.', 'Describe your business or product and prepare sales copy, social posts, customer replies and image prompts in one flow.'],
    ['Satış metni', 'Sales copy'],
    ['Sosyal medya', 'Social media'],
    ['Müşteri cevabı', 'Customer reply'],
    ['Görsel prompt', 'Image prompt'],
    ['Model, sağlayıcı veya yetenek ara...', 'Search models, providers or capabilities...'],
    ['Model seç, mesaj yaz veya görsel üret...', 'Choose a model, type a message or generate an image...'],
    ['Mesajınızı yazın...', 'Type your message...'],
    ['Nasıl yardımcı olabilirim?', 'How can I help?'],
    ['Bugün ne oluşturmak istersiniz?', 'What would you like to create today?']
  ].sort((a, b) => b[0].length - a[0].length);

  function normalize(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function translateString(value, lang) {
    if (lang !== 'en') return value;
    const leading = value.match(/^\s*/)?.[0] || '';
    const trailing = value.match(/\s*$/)?.[0] || '';
    const clean = normalize(value);
    if (!clean) return value;
    if (TR_EN.has(clean)) return leading + TR_EN.get(clean) + trailing;
    let translated = clean;
    for (const [tr, en] of PHRASES) translated = translated.split(tr).join(en);
    return translated === clean ? value : leading + translated + trailing;
  }

  function shouldSkip(node) {
    const parent = node.parentElement;
    return !parent || !!parent.closest('script,style,noscript,code,pre,textarea,[contenteditable="true"],.msg-content,.message-content,.user-message,[data-no-translate]');
  }

  function translateTextNode(node, lang) {
    if (shouldSkip(node)) return;
    if (!originalText.has(node)) originalText.set(node, node.nodeValue);
    const source = originalText.get(node);
    const next = translateString(source, lang);
    if (node.nodeValue !== next) node.nodeValue = next;
  }

  function translateAttributes(element, lang) {
    if (!(element instanceof Element) || element.closest('[data-no-translate]')) return;
    const attrs = ['placeholder', 'title', 'aria-label'];
    if (!originalAttrs.has(element)) originalAttrs.set(element, new Map());
    const saved = originalAttrs.get(element);
    for (const attr of attrs) {
      if (!element.hasAttribute(attr)) continue;
      if (!saved.has(attr)) saved.set(attr, element.getAttribute(attr));
      const source = saved.get(attr);
      const next = translateString(source, lang);
      if (element.getAttribute(attr) !== next) element.setAttribute(attr, next);
    }
  }

  function translateTree(root, lang) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root, lang);
      return;
    }
    if (!(root instanceof Element) && root !== document) return;
    if (root instanceof Element) translateAttributes(root, lang);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node, lang);
      else translateAttributes(node, lang);
    }
  }

  function readLanguage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
      return saved === 'en' ? 'en' : 'tr';
    } catch (_) {
      return 'tr';
    }
  }

  function syncControls(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dataset.froxyLang = lang;
    document.querySelectorAll('[data-froxy-lang-option],.lang-btn').forEach((button) => {
      const active = button.getAttribute('data-lang') === lang;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  let hasTranslatedEnglish = false;
  function setLanguage(lang) {
    lang = lang === 'en' ? 'en' : 'tr';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
      localStorage.setItem(LEGACY_KEY, lang);
      localStorage.setItem('ap_language', lang);
    } catch (_) {}
    syncControls(lang);
    if (lang === 'en' || hasTranslatedEnglish) translateTree(document.body, lang);
    if (lang === 'en') hasTranslatedEnglish = true;
    document.title = lang === 'en' ? 'Froxy AI - Your AI Work Assistant' : BASE_TITLE;
    window.currentLang = lang;
    document.dispatchEvent(new CustomEvent('froxy:languagechange', { detail: { lang } }));
    return lang;
  }

  let frame = 0;
  const queue = new Set();
  function schedule(root) {
    if (readLanguage() !== 'en' || !root) return;
    if (root.nodeType === Node.TEXT_NODE && shouldSkip(root)) return;
    if (root instanceof Element && root.closest('.msg-content,.message-content,.user-message,[data-no-translate]')) return;
    queue.add(root);
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const lang = readLanguage();
      if (lang !== 'en') {
        queue.clear();
        return;
      }
      const items = Array.from(queue);
      queue.clear();
      const elements = new Set(items.filter(item => item instanceof Element));
      for (const item of items) {
        const anchor = item.nodeType === Node.TEXT_NODE ? item.parentElement : item;
        let parent = anchor && anchor.parentElement;
        let covered = false;
        while (parent) {
          if (elements.has(parent)) {
            covered = true;
            break;
          }
          parent = parent.parentElement;
        }
        if (!covered) translateTree(item, lang);
      }
      syncControls(lang);
    });
  }

  window.froxySetLanguage = setLanguage;
  window.froxyCurrentLanguage = readLanguage;
  window.froxyToggleLanguage = function () {
    return setLanguage(readLanguage() === 'en' ? 'tr' : 'en');
  };
  window.translatePage = setLanguage;

  function boot() {
    setLanguage(readLanguage());
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-froxy-lang-option],.lang-btn');
      if (!button) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setLanguage(button.getAttribute('data-lang'));
    }, true);
    new MutationObserver((mutations) => {
      if (readLanguage() !== 'en') return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') schedule(mutation.target);
        for (const node of mutation.addedNodes) schedule(node);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
